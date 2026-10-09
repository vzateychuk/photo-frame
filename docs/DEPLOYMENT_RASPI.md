# Руководство по развертыванию на Raspberry Pi

Данный документ описывает процесс установки и настройки веб-фоторамки на Raspberry Pi.

## 1. Предварительные требования

### ПК разработки (сборка образа)
- **Podman** (на машине разработчика). Образ собирают здесь под `linux/arm64` и переносят на Pi в виде `.tar`, чтобы не компилировать Sharp и native-зависимости на ARM.
- Для кросс-сборки нужен QEMU/binfmt (обычно уже есть; если `podman build --platform linux/arm64` падает — см. шаг 1).

### Raspberry Pi (запуск)
- **Оборудование**: Raspberry Pi 3, 4 или 5.
- **ПО на Pi**: Docker, Docker Compose, Nginx на хостовой ОС.
- **Данные**: локальная папка или Samba-шара с фотографиями (JPEG/PNG).

## 2. Процесс развертывания

### Шаг 1: Сборка ARM-образа на ПК (Podman)

В корне репозитория:

```bash
cd /path/to/photo-frame

# Сборка под Raspberry Pi 4/5 (arm64).
# Тег docker.io/library/… нужен, чтобы после docker load на Pi
# имя совпало с image: photo-frame:raspi в docker-compose.yml
# (иначе Podman сохраняет localhost/photo-frame:raspi, и Compose
# продолжает поднимать старый photo-frame:raspi).
podman build --platform linux/arm64 -t docker.io/library/photo-frame:raspi .

# Экспорт в docker-compatible tar (чтобы на Pi принял docker load)
rm -f photo-frame-raspi.tar
podman save --format docker-archive -o photo-frame-raspi.tar docker.io/library/photo-frame:raspi
```

Эквивалент через `buildx` (у Podman это обёртка над Buildah; отдельный `buildx create` не нужен):

```bash
podman buildx build --platform linux/arm64 -t docker.io/library/photo-frame:raspi .
rm -f photo-frame-raspi.tar
podman save --format docker-archive -o photo-frame-raspi.tar docker.io/library/photo-frame:raspi
```

Для Pi 3 (32-bit ARM) вместо `linux/arm64` используйте `linux/arm/v7`.

**Если сборка ругается на qemu / binfmt**, один раз на ПК:

```bash
sudo podman run --rm --privileged multiarch/qemu-user-static --reset -p yes
```

После этого повторите `podman build --platform linux/arm64 …`.

Имена:
- тег образа: `photo-frame:raspi` (как в `docker-compose.yml`);
- файл для переноса: `photo-frame-raspi.tar`;
- контейнер на Pi: `photoframe`.

### Шаг 2: Перенос на Raspberry Pi

Скопируйте образ и `docker-compose.yml` (исходники на Pi не нужны):

```bash
scp photo-frame-raspi.tar docker-compose.yml vez@raspi.local:~/photoframe/
```

На Pi загрузите образ в Docker:

```bash
cd ~/photoframe
docker load -i photo-frame-raspi.tar
docker image ls | grep photo-frame
# Если видите localhost/photo-frame:raspi, а photo-frame:raspi — старый:
docker tag localhost/photo-frame:raspi photo-frame:raspi
```

### Шаг 3: Настройка окружения

Укажите путь к папке с фотографиями на хосте Pi.

1. Определите путь (например, в `~/.bashrc`):
   ```bash
   export HOST_PHOTOS_DIR=/путь/к/вашим/фото
   ```
2. Примените изменения:
   ```bash
   source ~/.bashrc
   ```
3. Создайте файл `.env` рядом с `docker-compose.yml`:
   ```bash
   echo "HOST_PHOTOS_DIR=$HOST_PHOTOS_DIR" > .env
   ```

### Шаг 4: Запуск контейнера (на Pi, Docker)

```bash
docker compose up -d --no-build
```

Флаг `--no-build` обязателен: иначе Compose попытается собрать образ из Dockerfile на Pi.

### Обновление уже задеплоенной версии

На ПК: шаг 1 (`podman build` + `podman save` + `scp`).  
На Pi:

```bash
cd ~/photoframe
docker load -i photo-frame-raspi.tar
docker tag localhost/photo-frame:raspi photo-frame:raspi   # если load дал тег localhost/…
docker compose up -d --force-recreate --no-build
curl -s http://localhost:3000/health
```

`--force-recreate` обязателен: иначе может остаться контейнер со старым слоем образа.

### Важно: два тега образа после `docker load` (подтверждено на Pi)

Podman при сборке/сохранении часто даёт имя `localhost/photo-frame:raspi`.  
`docker load` на Pi создаёт именно этот тег.  
В `docker-compose.yml` указано `image: photo-frame:raspi` — **другое имя**.

Если на Pi уже был старый `photo-frame:raspi`, Compose после `up` продолжает
брать его, даже когда новый образ уже загружен как `localhost/photo-frame:raspi`.
Снаружи кажется, что деплой прошёл, а в контейнере — файлы старой даты
(без `catalog.html`, старый `builtAt`).

Проверка:

```bash
docker image ls | grep photo-frame
# типичная картина после load из Podman-архива:
# localhost/photo-frame   raspi   <новый id>
# photo-frame             raspi   <старый id>   ← его и берёт Compose
```

Исправление (обязательный шаг, пока load даёт `localhost/…`):

```bash
docker tag localhost/photo-frame:raspi photo-frame:raspi
docker compose up -d --force-recreate --no-build
```

Убедиться, что поднялся новый образ:

```bash
docker exec photoframe ls -la /app/dist/public/
# ожидается catalog.html с датой свежей сборки

curl -s http://localhost:3000/health
# ожидается "builtAt":"<время сборки нового образа>"

curl -I http://localhost:3000/catalog.html
# ожидается HTTP/1.1 200 OK
```

Порядок на обновлении: сначала `docker load`, потом `docker tag`, потом
`docker compose up -d --force-recreate --no-build`.  
Если сделать `up` до `load`/`tag` — поднимется старое.

Предупреждение Compose про устаревший атрибут `version` в `docker-compose.yml`
означает, что на Pi лежит старая копия compose-файла; актуальный файл в репозитории
уже без `version` — скопируйте его вместе с образом при следующем деплое.

## 3. Инфраструктурные настройки

### Монтирование томов (Volumes)
Проект использует монтирование папки в режиме «только чтение» для защиты вашего архива:
`${HOST_PHOTOS_DIR}:/data/photos:ro`
Это гарантирует, что приложение может читать и ресайзить изображения, но не может их удалить или изменить.

### Защита SD-карты (Логирование)
Для предотвращения износа SD-карты из-за частой записи логов, в `docker-compose.yml` установлены ограничения:
- `max-size: "10m"` (макс. размер одного файла лога)
- `max-file: "3"` (макс. количество хранимых файлов)

### Обратный прокси Nginx
Для доступа к фоторамке через домен (например, `vez.vzateych.uk`) используется Nginx.

**Основные параметры настройки:**
- **Порт прослушивания**: 8082 (согласно сетевой конфигурации).
- **Бэкенд**: `http://localhost:3000`.
- **Оптимизация**: `proxy_buffering off` отключает буферизацию, чтобы изображения передавались потоком без задержек.

Пример конфигурации виртуального хоста:
```nginx
server {
    listen 8082;
    listen [::]:8082;

    server_name vez.vzateych.uk;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Отключаем буферизацию, чтобы картинки передавались потоком без задержек
        proxy_buffering off;
    }
}
```

## 4. Чек-лист проверки

- [ ] `docker image ls | grep photo-frame` — у `photo-frame:raspi` тот же IMAGE ID, что у свежего `localhost/photo-frame:raspi` (после `docker tag`), не старый id.
- [ ] `docker ps` показывает статус **Up** для контейнера `photoframe`.
- [ ] `docker exec photoframe ls /app/dist/public/` содержит `catalog.html` с датой свежей сборки.
- [ ] `curl -s http://localhost:3000/health` — `builtAt` совпадает со временем новой сборки (например `2026-10-09T23:16:35Z`).
- [ ] `curl -I http://localhost:3000/catalog.html` возвращает `200 OK`.
- [ ] Домен открывает слайд-шоу; `/catalog.html` — страницу каталога.
- [ ] Попытка создать файл в `/data/photos` внутри контейнера завершается ошибкой `Read-only file system`.
