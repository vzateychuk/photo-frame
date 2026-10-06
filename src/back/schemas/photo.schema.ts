import { z } from 'zod';

export const GetPhotoQuerySchema = z.object({
  w: z.coerce.number().int().min(100).max(3840).default(1920),
  h: z.coerce.number().int().min(100).max(2160).default(1080),
});

export const GetPhotoParamsSchema = z.object({
  id: z.string().min(1, 'ID обязателен'),
});

/**
 * Query for GET /api/play/next.
 * Optional comma-separated folder ids: ?folders=id1,id2,id3
 */
export const GetNextQuerySchema = z.object({
  folders: z
    .string()
    .min(1)
    .optional()
    .transform((value): string[] | undefined => {
      if (value === undefined) return undefined;
      const ids = value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      if (ids.length === 0) {
        throw new z.ZodError([
          {
            code: 'custom',
            path: ['folders'],
            message: 'folders must contain at least one id',
          },
        ]);
      }
      return ids;
    }),
});

export type GetPhotoQuery = z.infer<typeof GetPhotoQuerySchema>;
export type GetPhotoParams = z.infer<typeof GetPhotoParamsSchema>;
export type GetNextQuery = z.infer<typeof GetNextQuerySchema>;
