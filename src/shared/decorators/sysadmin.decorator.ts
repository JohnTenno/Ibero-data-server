import { SetMetadata } from '@nestjs/common';

export const SYSADMIN_ONLY_KEY = 'sysadminOnly';

export const SysadminOnly = () => SetMetadata(SYSADMIN_ONLY_KEY, true);
