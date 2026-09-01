import { z } from 'zod';

/** 按 (provider, providerId) 查找或创建用户的请求体 */
export const getUserByProviderRoSchema = z.object({
  provider: z.string(),
  providerId: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
});

export type GetUserByProviderRo = z.infer<typeof getUserByProviderRoSchema>;

/** 用户返回值（id 即 teableUserId，供主端使用） */
export const getUserVoSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

export type GetUserVo = z.infer<typeof getUserVoSchema>;
