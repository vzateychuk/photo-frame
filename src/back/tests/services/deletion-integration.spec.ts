import { describe, it, expect, beforeEach } from 'vitest';
import { PlaylistService } from '../../services/playlist.service.js';
import { ImageProcessorService, MissingPhotoFileError } from '../../services/image.service.js';
import type { PhotoItem } from '../../types.js';

describe('Photo Deletion Integration', () => {
  let playlistService: PlaylistService;
  let imageService: ImageProcessorService;

  beforeEach(() => {
    playlistService = new PlaylistService();

    // Связываем ImageProcessorService с PlaylistService через callback
    imageService = new ImageProcessorService({
      onError: (photoId) => {
        playlistService.removePhoto(photoId);
      },
    });
  });

  it('should remove photo from playlist when file is missing before Sharp opens', async () => {
    const photo: PhotoItem = { id: 'missing-1', path: '/non/existent/photo.jpg' };
    playlistService.loadPhotos([photo]);

    await expect(imageService.process(photo, { width: 100, height: 100 })).rejects.toBeInstanceOf(
      MissingPhotoFileError,
    );

    expect(playlistService.getById(photo.id)).toBeNull();
  });
});
