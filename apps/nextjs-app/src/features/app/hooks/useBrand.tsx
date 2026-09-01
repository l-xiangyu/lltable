/**
 * IMPORTANT LEGAL NOTICE:
 *
 * This file is part of Teable, licensed under the GNU Affero General Public License (AGPL).
 *
 * While Teable is open source software, the brand assets (including but not limited to
 * the Teable name, logo, and brand identity) are protected intellectual property.
 * Modification, replacement, or removal of these brand assets is strictly prohibited
 * and constitutes a violation of our trademark rights and the terms of the AGPL license.
 *
 * Under Section 7(e) of AGPLv3, we explicitly reserve all rights to the
 * Teable brand assets. Any unauthorized modification, redistribution, or use
 * of these assets, including creating derivative works that remove or replace
 * the brand assets, may result in legal action.
 */

import { useEnv } from './useEnv';

// 获取品牌信息，默认品牌名为 J博士投资管理系统 2026-02-28 23:00:00
export const useBrand = (): { brandName: string; brandLogo?: string } => {
  const env = useEnv();

  return {
    brandName: env.brandName || 'J博士投资管理系统',
    brandLogo: env.brandLogo,
  };
};
