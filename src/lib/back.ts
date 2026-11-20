/**
 * 안드로이드 뒤로 가기(버튼·제스처).
 * @capacitor/app 은 JS 리스너가 없으면 WebView 히스토리만 보는데, 이 앱은 히스토리를 쓰지 않아
 * 뒤로 가기가 아무 일도 하지 않았다. 열린 시트의 닫기 함수를 쌓아 두고 맨 위부터 닫는다.
 */
const stack: (() => void)[] = [];

/** 닫기 함수를 올린다. 돌려준 함수로 내린다(시트가 사라질 때). */
export function pushBack(close: () => void): () => void {
  stack.push(close);
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** 맨 위 시트를 닫았으면 true */
export function popBack(): boolean {
  const close = stack[stack.length - 1];
  if (!close) return false;
  close();
  return true;
}

/** 테스트용 */
export const backDepth = () => stack.length;
