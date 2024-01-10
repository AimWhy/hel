import type {
  CommonUtil as t13,
  IAppAndVer as t1,
  IControlPreFetchOptions as t2,
  IGetOptions as t10,
  IGetStyleOptions as t12,
  IGetVerOptions as t11,
  IGlobalConfig as t9,
  IGlobalConfigFull as t8,
  IHelMeta as t3,
  IPlatformConfig as t6,
  IPlatformConfigFull as t7,
  IPlatformConfigInitFull as t4,
  IShouldUseGray as t5,
} from 'hel-micro-core';
import * as apis from './apis';
import * as ins from './ins';
export type { IGroupedStyleList, IPreFetchAppOptions, IPreFetchLibOptions, IPreFetchOptionsBase, IStyleDataResult } from './types';

/** 暂时解决部分 v3 版本用户升级到 v4 后，原来使用 helMicro.core.IAppAndVer 标准类型出错的问题 */
export namespace core {
  export type IAppAndVer = t1;
  export type IControlPreFetchOptions = t2;
  export type IHelMeta = t3;
  export type IPlatformConfigInitFull = t4;
  export type IShouldUseGray = t5;
  export type IPlatformConfig = t6;
  export type IPlatformConfigFull = t7;
  export type IGlobalConfigFull = t8;
  export type IGlobalConfig = t9;
  export type IGetOptions = t10;
  export type IGetVerOptions = t11;
  export type IGetStyleOptions = t12;
  export type CommonUtil = t13;
}

export const {
  VER,
  preFetchLib,
  preFetchApp,
  batchPreFetchLib,
  appStyleSrv,
  appParamSrv,
  appMetaSrv,
  logicSrv,
  emitApp,
  init,
  isSubApp,
  getFakeHelContext,
  getExtraData,
  setExtraData,
  bindExternals,
  bindVueRuntime,
  bindReactRuntime,
  core,
} = apis;
export const { resetGlobalThis } = apis.core;
export const { createInstance, createOriginInstance } = ins;
export const eventBus = apis.core.getUserEventBus();

core.log(`hel-micro ver ${VER}`);

export default {
  VER,
  preFetchLib,
  preFetchApp,
  batchPreFetchLib,
  appStyleSrv,
  appParamSrv,
  appMetaSrv,
  logicSrv,
  emitApp,
  eventBus,
  init,
  isSubApp,
  getFakeHelContext,
  getExtraData,
  setExtraData,
  bindExternals,
  bindVueRuntime,
  bindReactRuntime,
  resetGlobalThis,
  core: apis.core,
  createInstance,
  createOriginInstance,
};
