import React from 'react';
import { IS_SERVER, IS_SHARED, SKIP_MERGE } from '../consts';
import { getSharedKey } from '../helpers/feature';
import type { Dict } from '../typing';
import { useForceUpdate } from './useForceUpdate';

interface IUseObjectLogicOptions {
  isStable?: boolean;
  [key: string | symbol]: any;
}

export function useObjectLogic<T extends Dict = Dict>(
  initialState: T | (() => T),
  options: IUseObjectLogicOptions,
): [T, (partialState: Partial<T>) => void] {
  const { isStable } = options;

  const [state, setFullState] = React.useState(initialState);
  const unmountRef = React.useRef(false);
  const forceUpdate = useForceUpdate();

  // initialState can not be a shared object if options's IS_SHARED symbol value is not true
  if (!IS_SERVER && !options[IS_SHARED] && getSharedKey(initialState)) {
    throw new Error('ERR_OBJ_NOT_NORMAL: can not pass a shared object to useObject!');
  }

  const setState = (partialState: Partial<T>) => {
    if (unmountRef.current) {
      // already unmounted
      return;
    }

    if (!isStable) {
      return setFullState((state) => ({ ...state, ...partialState }));
    }

    // start to handle isStable=true situation
    if (!options[SKIP_MERGE]) {
      Object.assign(state, partialState);
    }
    forceUpdate();
  };

  React.useEffect(() => {
    unmountRef.current = false; // 防止 StrictMode 写为 true
    // cleanup callback，标记组件已卸载
    return () => {
      unmountRef.current = true;
    };
  }, []);
  return [state, setState];
}

/**
 * 使用 useObject 有两个好处
 * ```txt
 * 1 方便定义多个状态值时，少写很多 useState
 * 2 内部做了 unmount 判断，让异步函数也可以安全的调用 setState，避免 react 出现警告 :
 * "Called SetState() on an Unmounted Component" Errors
 * ```
 * @param initialState
 * @returns
 */
export function useObject<T extends Dict = Dict>(initialState: T | (() => T), isStable?: boolean): [T, (partialState: Partial<T>) => void] {
  return useObjectLogic(initialState, { isStable });
}
