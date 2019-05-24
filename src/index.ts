/* eslint-disable security/detect-non-literal-require */
import Flow from '@faasjs/flow';
import Logger from '@faasjs/logger';
import { loadFlow } from '@faasjs/load';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import * as rollup from 'rollup';
import typescript from 'rollup-plugin-typescript2';

// 缓存云资源 sdk
const resourceSdks: any = {};

// 读取 sdk
const loadSdk = function (root: string, name: string) {
  if (!name) {
    throw Error('Unknow sdk');
  }

  if (resourceSdks[name as string]) {
    return resourceSdks[name as string];
  }

  const paths = [
    `${root}/config/providers/libs/${name}/index.ts`,
    `${process.cwd()}/node_modules/@faasjs/provider-${name}/lib/index.js`,
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      resourceSdks[name as string] = require(path);
      return resourceSdks[name as string];
    }
  }

  throw Error(`Sdk load failed\nfind paths:\n${paths.join('\n')}`);
};

interface Func {
  build: string;
  name: string;
  resource: {
    [key: string]: any;
  };
  type: string | number;
  tmpFolder?: string;
  packageJSON?: {
    [key: string]: any;
  };
}

interface Trigger {
  name: string;
  resource: any;
  type: string;
  origin: any;
  func: Func;
  package: {
    name: string;
    version: string;
  };
}

interface Resource {
  package: {
    name: string;
    version: string;
  };
}

/**
 * 发布实例
 */
export default class Deployer {
  public name?: string;
  public root: string;
  public file: string;
  public staging: string;
  public flow?: Flow;
  public logger: Logger;

  /**
   * 创建发布实例
   * @param root {string} 根目录路径
   * @param file {string} 流程文件路径
   * @param staging {string} 发布环境，默认为 testing
   */
  constructor (root: string, file: string, staging?: string) {
    if (root.endsWith('/')) {
      this.root = root;
    } else {
      this.root = root + '/';
    }

    if (!file.endsWith('.flow.ts')) {
      throw Error('Flow file should end with .flow.ts');
    }

    this.file = file;
    this.staging = staging || 'testing';
    this.logger = new Logger('@faasjs/deployer');
  }

  public async build () {
    this.logger.info('开始构建 %s', this.file);

    // 临时编译 ts
    const bundle = await rollup.rollup({
      input: this.file,
      plugins: [
        typescript({
          tsconfigOverride: {
            compilerOptions: {
              declaration: false,
              module: 'esnext'
            }
          }
        }),
      ]
    });

    await bundle.write({
      file: this.file + '.tmp.js',
      format: 'cjs'
    });

    this.flow = require(this.file + '.tmp.js');

    unlinkSync(this.file + '.tmp.js');

    if (!this.flow) {
      throw Error(`Flow load failed: ${this.file}.tmp.js`);
    }

    this.name = this.flow.name || this.file.replace(this.root, '').replace('.flow.ts', '').replace(/^\/?[^/]+\//, '').replace(/\/$/, '');

    loadFlow(this.flow, this.root, this.file, this.staging);

    const time = new Date().toLocaleString('zh-CN', {
      hour12: false,
      timeZone: 'Asia/Shanghai',
    }).replace(/(\/|:|\s)/g, '_');

    const tmpFolder = `${this.root}tmp/functions/${this.name}/${time}`;

    this.logger.debug('解析云函数');

    const functions: Func[] = [];
    const triggers: Trigger[] = [];
    const resources: Resource[] = [];

    // 解析触发配置
    for (const type in this.flow.triggers) {
      if (this.flow.triggers.hasOwnProperty(type)) {
        // 增加触发函数
        const func: Func = {
          build: time,
          name: this.name + '@trigger_' + type,
          resource: this.flow.resource!,
          type,
        };

        functions.push(func);

        // 增加触发器
        const trigger = this.flow.triggers[type as string];

        // 查找云资源对应的 npm 包是否存在
        let packageName = `@faasjs/trigger-${trigger.type || type}`;
        let handler;
        try {
          handler = require(packageName).handler;
        } catch (error) {
          try {
            handler = require(trigger.type!).hanlder;
          } catch (error) {
            throw Error(`Not found trigger package: ${packageName}, ${trigger.type}`);
          }
        }

        if (typeof handler !== 'function') {
          throw Error(`Triggers#${type}'s package is not a function`);
        }

        triggers.push({
          name: this.name,
          resource: trigger.resource,
          type,
          origin: trigger,
          func,
          package: {
            name: packageName,
            version: 'beta'
          }
        });
      }
    }

    // 若未配置触发器且不是异步模式，则默认生成一个 invoke 触发器的云函数
    if (functions.length === 0 && this.flow.mode === 'sync') {
      functions.push({
        build: time,
        name: this.name + '@invoke',
        resource: this.flow.resource!,
        type: -1,
      });
    }

    // 异步模式的流程生成多个云函数
    if (this.flow.mode === 'async') {
      for (let i = 0; i < this.flow.steps.length; i++) {
        functions.push({
          build: time,
          name: this.name + '@invoke_' + i,
          resource: this.flow.resource!,
          type: i,
        });
      }
    }

    // 解析云资源
    for (const type in this.flow.resources) {
      if (this.flow.resources.hasOwnProperty(type)) {
        // 增加云资源
        const resource = this.flow.resources[type as string];

        // 查找云资源对应的 npm 包是否存在
        let packageName = `@faasjs/provider-${resource.type}`;
        let handler;
        try {
          handler = require(packageName).hanlder;
        } catch (error) {
          try {
            handler = require(resource.type!).handler;
          } catch (error) {
            throw Error(`Not found resource package: ${packageName}, ${resource.type}`);
          }
        }

        if (typeof handler !== 'function') {
          throw Error(`Resources#${type}'s package is not a function`);
        }

        resources.push({
          package: {
            name: packageName,
            version: 'beta'
          }
        });
      }
    }

    this.logger.debug('解析完毕\n云函数：%o\n触发器：%o\n云资源：%o', functions, triggers, resources);

    for (const func of functions) {
      this.logger.label = '@faasjs/build:' + func.name;
      this.logger.debug('开始构建');

      func.tmpFolder = tmpFolder + '/' + func.name;
      this.logger.debug('创建临时文件夹 %s', func.tmpFolder);
      func.tmpFolder.split('/').reduce(function (acc: string, cur: string) {
        acc += '/' + cur;
        if (!existsSync(acc)) {
          mkdirSync(acc);
        }
        return acc;
      });

      this.logger.debug('添加基础依赖');
      func.packageJSON = {
        dependencies: {
          '@faasjs/flow': 'beta',
          ['@faasjs/provider-' + func.resource.type]: 'beta'
        },
        private: true
      };

      if (triggers.length) {
        for (const resource of triggers) {
          func.packageJSON.dependencies[resource.package.name] = resource.package.version;
        }
      }

      if (resources.length) {
        for (const resource of resources) {
          func.packageJSON.dependencies[resource.package.name] = resource.package.version;
        }
      }

      this.logger.debug('写入 index.js');

      const bundle = await rollup.rollup({
        input: this.file,
        plugins: [
          typescript({
            tsconfigOverride: {
              compilerOptions: {
                declaration: false,
                module: 'esnext'
              }
            }
          }),
        ]
      });

      bundle.cache.modules!.forEach(function (m: { dependencies: string[] }) {
        m.dependencies.forEach(function (d: string) {
          if (d.includes('node_modules') && !func.packageJSON!.dependencies[d as string]) {
            func.packageJSON!.dependencies[d as string] = '*';
          }
        });
      });

      await bundle.write({
        file: func.tmpFolder + '/index.js',
        format: 'cjs',
        name: 'index',
        banner: `/**
 * @name ${func.name}
 * @author ${process.env.LOGNAME}
 * @build ${func.build}
 * @staging ${this.staging}
 */`,
        footer: `
const deepMerge = require('@faasjs/deep_merge');
const flow = module.exports;
flow.name = '${this.name}';
flow.resource = deepMerge(${JSON.stringify(this.flow.resource)}, flow.resource);
flow.resources = deepMerge(${JSON.stringify(this.flow.resources)}, flow.resources);
flow.handler = flow.createTrigger(${JSON.stringify(func.type)});`
      });

      this.logger.debug('写入 package.json');
      writeFileSync(func.tmpFolder + '/package.json', JSON.stringify(func.packageJSON));

      ['install --production'].forEach((cmd) => {
        this.logger.debug('yarn ' + cmd);

        execSync('yarn --cwd ' + func.tmpFolder + ' ' + cmd);
      });
    }

    return {
      functions,
      triggers,
      resources,
    };
  }

  public async deploy ({
    functions,
    triggers,
  }: {
    functions: any[];
    triggers: any[];
  }) {
    for (const func of functions) {
      this.logger.label = '@faasjs/deploy:' + func.name;
      this.logger.info('开始发布云函数 %s', func.name);

      const sdk = loadSdk(this.root, func.resource.type);
      await sdk.deploy(this.staging, func);
    }

    for (const trigger of triggers) {
      this.logger.label = '@faasjs/deploy:' + trigger.type;
      this.logger.info('开始发布触发器 %s', trigger.type);

      const sdk = loadSdk(this.root, trigger.resource.type);
      await sdk.deploy(this.staging, trigger);
    }

    return true;
  }
}
