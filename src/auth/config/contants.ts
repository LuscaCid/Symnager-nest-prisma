import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'IsPublic';

export const SkipAuth = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_PUBLIC_STEP = 'isPublicStep'

export const skipStep = () => SetMetadata(IS_PUBLIC_STEP, true)