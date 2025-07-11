/** @typedef {import('../types').SrcMap} SrcMap*/
/** @typedef {import('../types').IAssetOptions} IAssetOptions*/
/** @typedef {import('../types').IAssetInfo} IAssetInfo */
/** @typedef {import('../types').IInnerFillAssetListOptions} IInnerFillAssetListOptions */
import fs from 'fs';
import util from 'util';
import { slash } from '../base-utils/index';
import { makeFileDescList } from '../inner-utils';
import { noDupPush } from '../inner-utils/arr';
import { verbose } from '../inner-utils/index';
import { isNull } from '../inner-utils/obj';
import { pfstr } from '../inner-utils/str';
import { getAllFilePath } from './utils';

const writeFile = util.promisify(fs.writeFile);

/** jsdom 15 里去内联脚本 innerText 取不到，这里用此函数辅助 */
function getInnerText(/** @type {HTMLElement}} */ dom) {
  return dom.innerText || dom.innerHTML || '';
}

function getDatasetVal(dataset, key, defaultValIfOnlyKey) {
  const hasKey = Object.prototype.hasOwnProperty.call(dataset, key);
  if (hasKey) {
    return dataset[key] || defaultValIfOnlyKey;
  }
  return '';
}

function isRelativePath(path) {
  if (path.startsWith('//')) return false;
  return path.startsWith('/') || path.startsWith('./') || path.startsWith('../');
}

function buildAssetItem(tag, /** @type {IAssetInfo} */ assetInfo) {
  const isLink = tag === 'link';
  const { isBuildUrl, isNonBuildAndRelative, canAppend, el, url, innerText } = assetInfo;
  let attrs = {};
  if (url) {
    attrs = isLink ? { href: url } : { src: url };
  }

  let tagVar = '';
  if (isBuildUrl) {
    tagVar = tag;
  } else if (isNonBuildAndRelative) {
    tagVar = isLink ? 'relativeLink' : 'relativeScript';
  } else {
    tagVar = isLink ? 'staticLink' : 'staticScript';
  }

  const assetItem = { tag: tagVar, append: canAppend, attrs };
  if (innerText) {
    assetItem.innerText = innerText;
  }

  const attrNames = el.getAttributeNames();
  attrNames.forEach((name) => {
    // src href 上面已记录真正的目标值，故移除
    // data-helappend 只在提取元数据辅助计算 append 值时用到，故此处移除
    if (['src', 'href', 'data-helappend'].includes(name)) return;
    attrs[name] = el.getAttribute(name);
  });

  return assetItem;
}

let custScriptIdx = 0;

/**
 * @param {HTMLScriptElement | HTMLStyleElement} childDom
 * @param {string} fileType
 * @param {IInnerFillAssetListOptions} options
 */
async function writeInnerText(childDom, fileType, options) {
  const { homePage, buildDirFullPath } = options;
  const innerText = getInnerText(childDom);
  if (!innerText) return '';

  verbose(`found a user customized ${fileType} tag node in html, try extract its content and write them to local fs`);
  custScriptIdx += 1;
  const scriptName = `hel_userChunk_${custScriptIdx}.${fileType}`;
  const fileAbsolutePath = `${buildDirFullPath}/${scriptName}`;
  const fileWebPath = `${slash.noEnd(homePage)}/${scriptName}`;

  await writeFile(fileAbsolutePath, innerText);
  verbose(`write done, the web file will be ${fileWebPath} later`);
  return fileWebPath;
}

/**
 * @param {string} url
 * @param {IAssetOptions} options
 */
function getAssetInfo(url, options) {
  const { homePage, extractMode, enableRelativePath, enableAssetInnerText, el, innerText } = options;
  const { dataset = {} } = el;
  // 是构建生成的产物路径，无 url 的当做是内联的处理，isBuildUrl 强制为 true
  const isBuildUrl = url ? url.startsWith(homePage) : true;
  const isRelative = isRelativePath(url);
  // 是 homePage 之外相对路径导入的产物路径
  const isNonBuildAndRelative = !isBuildUrl && isRelative;
  const isStatic = !isBuildUrl && !isRelative;
  const isIcoAsset = url.endsWith('.ico');
  // 设置了 extractMode 为 build 和 build_no_html 时，当前产物路径是非构建生成的，则直接忽略，不记录到 assetList 数据里
  const ignoreAddToAssetList = !isBuildUrl && (extractMode === 'build' || extractMode === 'build_no_html');
  let allowAddToAssetList = !ignoreAddToAssetList;
  if (!allowAddToAssetList) {
    verbose(` >>> ignore add asset [${url}] to assetList by extractMode=${extractMode}`);
  }

  // 未显式设置 data-helappend 时，helappend 默认值会走内部逻辑来决定如何赋值
  let helAppendValOfDataset = getDatasetVal(dataset, 'helappend', '1');
  let helAppendValOfInnerLogic = '';
  if (helAppendValOfDataset && !['1', '0'].includes(helAppendValOfDataset)) {
    throw new Error(`found invalid helappend value [${helAppendValOfDataset}], only accpet 1 or 0 currently`);
  }

  const ex = dataset.helex || '';
  if (isNonBuildAndRelative) {
    if (isIcoAsset && !helAppendValOfDataset) {
      helAppendValOfDataset = '0'; // ico 文件特殊处理，默认是不加载的
    } else if (ex && !helAppendValOfDataset) {
      helAppendValOfDataset = '1'; // 标记了 ex 的文件特殊处理，默认需要加载，能不能真的追加到文档上，取决于 hel-micro 的重复检测结果
    }

    // 如下面错误描述所示，在既没有设置 enableRelativePath=true，又没有显式的标记 data-helappend 的情况下
    // 不允许 homePage 之外的相对路径导入的资源存在
    // 所以对于此类 homePage 之外的相对路径导入的资源，要么用户设置 enableRelativePath=true，要么显式的标记 data-helappend
    // 设置 enableRelativePath=true 后，优先读可能已存在的 data-helappend 值，没有则默认为 0，表示不加载
    // 不设置 enableRelativePath=true 的话，则需要用户一定标记 data-helappend 值
    if (!enableRelativePath && !helAppendValOfDataset) {
      throw new Error(
        pfstr(`
        found asset url [${url}] is a relative path, it is obviously not a valid url for cdn architecture deploy!
        but if you are sure this url is valid, there are 2 ways to skip this error occured, you can choose any one of them:
        1. pass enableRelativePath true to hel-dev-utils.extractHelMetaJson method options.
        2. add data-helappend="0" on the asset dom attribute to tell hel-dev-utils ignore this asset.

        hel-dev-utils will mark this url as relativeLink or relativeScript, and set append as false,
        if you want sdk append this asset, you can explicitly add data-helappend="1" on the asset dom attribute.
        a demo will be like:<script src="./a/b.js" data-helappend="1"></script>,<br/>
        note that the asset will depend on your host site seriously under this situation.
      `),
      );
    }

    // 构建时设置 enableRelativePath=true，则允许此类【homePage之外相对路径导入的产物】加入到资源清单列表里
    allowAddToAssetList = true;
    helAppendValOfInnerLogic = helAppendValOfDataset || '0'; // 没有显示设定 data-helappend 时默认标记为不加载
  } else if (isIcoAsset) {
    helAppendValOfInnerLogic = '0'; // ico 文件特殊处理，默认是不加载的
  } else if (isStatic) {
    if (ex) {
      // 对于标记了 helex 的元素，默认是 append 的，能不能真的追加到文档上，取决于 hel-micro 的重复检测结果
      // 重复则不追加，不重复则追加
      helAppendValOfInnerLogic = helAppendValOfDataset || '1';
    } else {
      helAppendValOfInnerLogic = '0';
    }
  } else {
    // isBuild
    helAppendValOfInnerLogic = '1'; // 标记为可加载
  }

  const helAppendVal = helAppendValOfDataset || helAppendValOfInnerLogic;
  const helAppend = helAppendVal === '1';
  if (ex && !helAppend) {
    // 设置了 helex 但同时设置了不加载，会造成歧义，当前版本是不允许的
    throw new Error(
      pfstr(`
      found conflict setting for helex: [data-helex="${ex}"]、[data-helappend="${helAppendVal}"],
      remove data-helappend( append is true for helex by default ) or set data-helappend="1"!
    `),
    );
  }

  return {
    url,
    el,
    isBuildUrl,
    isNonBuildAndRelative,
    canAppend: helAppend,
    allowAddToAssetList,
    innerText: enableAssetInnerText ? innerText : '',
  };
}

/**
 * 提取link、script标签数据并填充到目标assetList
 * @param {HTMLCollectionOf<HTMLScriptElement>} doms
 * @param {IInnerFillAssetListOptions} options
 */
export async function fillAssetList(doms, options) {
  const {
    homePage,
    enableReplaceDevJs = true,
    enableRelativePath = false,
    enableAssetInnerText = true,
    enablePrefixHomePage = false,
    srcMap,
    isHead,
  } = options;
  const {
    headAssetList,
    bodyAssetList,
    extractMode,
    chunkCssSrcList,
    staticCssSrcList,
    relativeCssSrcList,
    chunkJsSrcList,
    staticJsSrcList,
    relativeJsSrcList,
  } = srcMap;
  const assetList = isHead ? headAssetList : bodyAssetList;

  const len = doms.length;
  const replaceContentList = [];
  verbose(`extractMode is ${extractMode}`);
  verbose(`enableAssetInnerText is ${enableAssetInnerText}`);

  const pushToSrcList = (assetType, /** @type {IAssetInfo} */ assetInfo) => {
    const { isBuildUrl, isNonBuildAndRelative, url } = assetInfo;
    const isAllExtractMode = extractMode === 'all' || extractMode === 'all_no_html';

    if (assetType === 'css') {
      if (isBuildUrl) {
        return noDupPush(chunkCssSrcList, url);
      }
      if (isAllExtractMode) {
        const list = isNonBuildAndRelative ? relativeCssSrcList : staticCssSrcList;
        return noDupPush(list, url);
      }
    }

    if (isBuildUrl) {
      return noDupPush(chunkJsSrcList, url);
    }
    if (isAllExtractMode) {
      const list = isNonBuildAndRelative ? relativeJsSrcList : staticJsSrcList;
      return noDupPush(list, url);
    }
  };

  const mayPrefixHomePage = (url) => {
    if (enablePrefixHomePage) {
      if (url.startsWith('/') && !url.startsWith('//')) {
        verbose(` >>> prefix homePage [${homePage}] for url [${url}]`);
        const finalUrl = `${slash.noEnd(homePage)}${url}`;
        replaceContentList.push({ toMatch: `="${url}"`, toReplace: `="${finalUrl}"` });
        return finalUrl;
      }
    }
    return url;
  };

  for (let i = 0; i < len; i++) {
    const childDom = doms[i];
    const { tagName, dataset = {} } = childDom;
    const innerText = getInnerText(childDom);
    let toPushAsset = null;
    let allowAddToAssetList = false;
    const assetOptions = { el: childDom, innerText, homePage, extractMode, enableRelativePath, enableAssetInnerText };

    if (!['LINK', 'SCRIPT', 'STYLE'].includes(tagName)) {
      continue;
    }
    if (!isNull(dataset)) {
      verbose(`found ${tagName} dataset`, dataset);
    }

    if (tagName === 'LINK') {
      const { hreflang = '', href: oriHref } = childDom;
      verbose(`analyze link href:[${oriHref}]`);
      if (!oriHref) continue;

      let href = mayPrefixHomePage(oriHref);
      verbose(`analyze link [${href}]`);
      // 一些使用了老版本cra的项目，这两个href 在修改了 publicPath 后也不被添加前缀，这里做一下修正
      const legacyHrefs = ['/manifest.json', '/favicon.ico'];
      if (legacyHrefs.includes(href)) {
        const oldHref = href;
        href = `${homePage}${href}`;
        replaceContentList.push({ toMatch: href, toReplace: href });
        verbose(`replace link [${oldHref}] to [href]`);
      }

      const assetInfo = getAssetInfo(href, assetOptions);
      allowAddToAssetList = assetInfo.allowAddToAssetList;
      // 供 shadow-dom 或其他需要知道当前应用所有样式列表的场景用
      if (href.endsWith('.css')) {
        pushToSrcList('css', assetInfo);
      }
      toPushAsset = buildAssetItem('link', assetInfo);
    } else if (tagName === 'SCRIPT') {
      const { src } = childDom;
      verbose(`analyze script src:[${src}], innerText:[${innerText}]`);

      if (!src && !innerText) {
        continue;
      }

      if (!src && innerText && enableAssetInnerText) {
        verbose('user set enableAssetInnerText = true and found SCRIPT node innerText');
        const assetInfo = getAssetInfo('', assetOptions);
        allowAddToAssetList = assetInfo.allowAddToAssetList;
        toPushAsset = buildAssetItem('script', assetInfo);
      } else {
        let targetSrc = src;
        if (!targetSrc) {
          targetSrc = await writeInnerText(childDom, 'js', options);
        }
        if (!targetSrc) continue;

        targetSrc = mayPrefixHomePage(targetSrc);
        if (enableReplaceDevJs) {
          // 替换用户的 development 模式的 react 相关包体
          if (targetSrc.endsWith('react.dev.js')) {
            const toReplace = targetSrc.replace('react.dev.js', 'react.js');
            replaceContentList.push({ toMatch: targetSrc, toReplace });
            targetSrc = toReplace;
          }
          // 替换用户的 development 模式的 vue 相关包体
          if (targetSrc.endsWith('vue.dev.js')) {
            const toReplace = targetSrc.replace('vue.dev.js', 'vue.js');
            replaceContentList.push({ toMatch: targetSrc, toReplace });
            targetSrc = toReplace;
          }
        }

        const assetInfo = getAssetInfo(targetSrc, assetOptions);
        allowAddToAssetList = assetInfo.allowAddToAssetList;

        pushToSrcList('js', assetInfo);
        toPushAsset = buildAssetItem('script', assetInfo);
      }
    } else if (tagName === 'STYLE') {
      verbose(`analyze style innerText:[${innerText}]`);

      if (innerText && enableAssetInnerText) {
        verbose('user set enableAssetInnerText = true and found STYLE node innerText');
        const assetInfo = getAssetInfo('', assetOptions);
        allowAddToAssetList = assetInfo.allowAddToAssetList;
        toPushAsset = buildAssetItem('style', assetInfo);
      } else {
        // style 标签转换为 css 文件存起来，以便让 hel-micro 用 link 标签加载
        let href = await writeInnerText(childDom, 'css', options);
        if (!href) continue;

        href = mayPrefixHomePage(href);
        const assetInfo = getAssetInfo(href, assetOptions);
        allowAddToAssetList = assetInfo.allowAddToAssetList;

        pushToSrcList('css', assetInfo);
        toPushAsset = buildAssetItem('link', assetInfo);
      }
    }

    if (toPushAsset && allowAddToAssetList) {
      assetList.push(toPushAsset);
    }
  }

  return replaceContentList;
}

/**
 * @param {IInnerFillAssetListOptions} options
 */
export async function fillAssetListByDist(options) {
  const { homePage, srcMap, buildDirFullPath } = options;
  const fileFullPathList = getAllFilePath(buildDirFullPath);
  const matchSrvModFile = options.matchSrvModFile || (() => false);
  const matchSrvModFileIndex = options.matchSrvModFileIndex || (() => false);
  const matchIncludedFile = options.matchIncludedFile || (() => true);
  const matchExcludedFile = options.matchExcludedFile || (() => false);
  const fileDescList = makeFileDescList(fileFullPathList, homePage, buildDirFullPath);
  verbose('filePathList', fileFullPathList);

  fileDescList.forEach((item) => {
    const { fileAbsolutePath } = item;
    //  获取文件处于build目录下的相对路径，形如：
    //  /static/js/runtime-main.66c45929.js
    //  /asset-manifest.json
    const filePathUnderBuild = fileAbsolutePath.split(buildDirFullPath)[1];
    // 拼出 web 路径
    const fileWebPath = `${slash.noEnd(homePage)}${slash.start(filePathUnderBuild)}`;

    // 非包含的文件，忽略掉
    if (!matchIncludedFile(item)) {
      return;
    }
    // 在包含的文件里需排除的文件，忽略掉
    if (matchExcludedFile(item)) {
      return;
    }
    // 是 server 端需要的文件
    if (matchSrvModFile(item)) {
      noDupPush(srcMap.srvModSrcList, fileWebPath);
      if (matchSrvModFileIndex(item)) {
        srcMap.srvModSrcIndex = fileWebPath;
      }
    } else if (fileWebPath.endsWith('.css')) {
      // 补上剩余的 css 文件路径
      noDupPush(srcMap.chunkCssSrcList, fileWebPath);
    } else if (fileWebPath.endsWith('.js')) {
      noDupPush(srcMap.chunkJsSrcList, fileWebPath);
    } else {
      noDupPush(srcMap.otherSrcList, fileWebPath);
    }
  });
}
