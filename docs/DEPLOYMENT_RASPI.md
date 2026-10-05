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

# Сборка под Raspberry Pi 4/5 (arm64)
podman build --platform linux/arm64 -t photo-frame:raspi .

# Экспорт в docker-compatible tar (чтобы на Pi принял docker load)
podman save --format docker-archive -o photo-frame-raspi.tar photo-frame:raspi
```

Эквивалент через `buildx` (у Podman это обёртка над Buildah; отдельный `buildx create` не нужен):

```bash
podman buildx build --platform linux/arm64 -t photo-frame:raspi .
podman save --format docker-archive -o photo-frame-raspi.tar photo-frame:raspi
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
scp photo-frame-raspi.tar docker-compose.yml user@pi-host:~/photo-frame/
```

На Pi загрузите образ в Docker:

```bash
cd ~/photo-frame
docker load -i photo-frame-raspi.tar
docker image ls | grep photo-frame
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

На ПК: шаг 1 (`podman build` + `podman save`).  
На Pi: шаг 2 (`docker load`) и снова:

```bash
docker compose up -d --no-build
```

Compose подхватит новый образ с тем же тегом `photo-frame:raspi`.

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

- [ ] `docker ps` показывает статус **Up** для контейнера `photoframe`.
- [ ] `curl -I http://localhost:3000/health` возвращает `200 OK`.
- [ ] Домен `http://vez.vzateych.uk` открывает интерфейс слайд-шоу.
- [ ] Попытка создать файл в `/data/photos` внутри контейнера завершается ошибкой `Read-only file system`.
