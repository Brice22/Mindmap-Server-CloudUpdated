import { SetMetadata } from '@nestjs/common';

// @Public() on a route = no login needed (the login pages themselves, Prometheus metrics)
export const IS_PUBLIC = 'hserver:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);