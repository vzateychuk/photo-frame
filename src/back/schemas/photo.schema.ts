import { z } from 'zod';

export const GetPhotoQuerySchema = z.object({
  key: z.any().optional(),
  w: z.coerce.number().int().min(100).max(3840).default(1920),
  h: z.coerce.number().int().min(100).max(2160).default(1080),
});

export const GetPhotoParamsSchema = z.object({
  id: z.string().min(1, 'ID обязателен'),
});

/**
 * Query for GET /api/play/next.
 * Access is gated by `key`; guest `folders` filter is no longer accepted.
 */
export const GetNextQuerySchema = z.object({
  key: z.any().optional(),
});

/**
 * Query for GET /api/catalog.
 * Optional name substring: ?q=vacation
 */
export const ListFoldersQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'q must not be empty')
    .max(200)
    .optional(),
});

export const CreateKeyBodySchema = z.object({
  label: z.string(),
  folders: z.union([
    z.literal('all'),
    z.array(z.string()).min(1, 'folders must contain at least one id'),
  ]),
  ttlHours: z.number().int().positive().optional(),
});

export type GetPhotoQuery = z.infer<typeof GetPhotoQuerySchema>;
export type GetPhotoParams = z.infer<typeof GetPhotoParamsSchema>;
export type GetNextQuery = z.infer<typeof GetNextQuerySchema>;
export type ListFoldersQuery = z.infer<typeof ListFoldersQuerySchema>;
export type CreateKeyBody = z.infer<typeof CreateKeyBodySchema>;
