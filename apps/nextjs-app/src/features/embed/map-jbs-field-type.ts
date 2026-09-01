import { FieldType } from '@teable/core';

/** 主端字典字段类型码 */
export const JBS_FIELD_TYPE_DICT = 'ZD';

/** 主端用户字段类型码 */
export const JBS_FIELD_TYPE_USER = 'YH';

/**
 * 主端指标字段类型码 -> Teable FieldType
 * WB: 文本；JE/BL: 数字；RQ: 日期；ZD: 字典；YH: 用户
 */
export const mapJbsFieldTypeToTeable = (jbsType?: string): FieldType => {
  switch (jbsType) {
    case 'JE':
    case 'BL':
      return FieldType.Number;
    case 'RQ':
      return FieldType.Date;
    case JBS_FIELD_TYPE_DICT:
      return FieldType.SingleSelect;
    case JBS_FIELD_TYPE_USER:
      return FieldType.User;
    case 'WB':
    default:
      return FieldType.SingleLineText;
  }
};

/** 是否主端字典字段 */
export const isJbsDictFieldType = (jbsType?: string): boolean => jbsType === JBS_FIELD_TYPE_DICT;

/** 是否主端用户字段 */
export const isJbsUserFieldType = (jbsType?: string): boolean => jbsType === JBS_FIELD_TYPE_USER;
