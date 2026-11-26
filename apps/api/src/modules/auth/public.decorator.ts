import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const ALLOW_QUERY_TOKEN_KEY = 'allowQueryToken';

export const Public = (): CustomDecorator<string> =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const AllowQueryToken = (): CustomDecorator<string> =>
  SetMetadata(ALLOW_QUERY_TOKEN_KEY, true);
