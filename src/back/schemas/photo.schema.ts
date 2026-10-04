import { z } from 'zod';

export const GetPhotoQuerySchema = z.object({
  w: z.coerce.number().int().min(100).max(3840).default(1920),
  h: z.coerce.number().int().min(100).max(2160).default(1080),
});

export const GetPhotoParamsSchema = z.object({
  id: z.string().min(1, 'ID обязателен'),
});

export type GetPhotoQuery = z.infer<typeof GetPhotoQuerySchema>;
export type GetPhotoParams = z.infer<typeof GetPhotoParamsSchema>;
