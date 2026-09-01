/** 是否运行在主端 iframe 内 */
export const isInLltableEmbed = (): boolean => {
  return typeof window !== 'undefined' && window.parent !== window;
};

/** 向主端父页面发送 postMessage */
export const postToLltableParent = (payload: Record<string, unknown>): void => {
  if (!isInLltableEmbed()) {
    return;
  }
  window.parent.postMessage(payload, '*');
};
