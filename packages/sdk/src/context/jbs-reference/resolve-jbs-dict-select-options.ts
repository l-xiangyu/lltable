import type { ISelectFieldChoice } from '@teable/core';
import { ColorUtils } from '@teable/core';
import colors from 'tailwindcss/colors';
import type { IJbsDictSelectOption, IJbsReferenceFieldMeta } from './JbsReferenceRecordsContext';

/** 主端字典字段类型码 */
export const JBS_FIELD_TYPE_DICT = 'ZD';

export const isJbsReferenceDictFieldMeta = (meta?: IJbsReferenceFieldMeta): boolean => {
  if (!meta) {
    return false;
  }
  if (meta.jbsType === JBS_FIELD_TYPE_DICT) {
    return true;
  }
  return Boolean(meta.dictType?.trim());
};

/** Teable choices -> 下拉选项 */
export const mapDictChoicesToSelectOptions = (
  choices: ISelectFieldChoice[] | undefined
): IJbsDictSelectOption[] => {
  if (!choices?.length) {
    return [];
  }
  return choices.map(({ name, color }) => ({
    label: name,
    value: name,
    color: ColorUtils.shouldUseLightTextOnColor(color) ? colors.white : colors.black,
    backgroundColor: ColorUtils.getHexForColor(color),
  }));
};
