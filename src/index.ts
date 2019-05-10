/* eslint-disable security/detect-non-literal-require */
import Flow from '@faasjs/flow';
import { deepMerge, Logger } from '@faasjs/utils';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as YAML from 'js-yaml';
import * as rollup from 'rollup';
import typescript from 'rollup-plugin-typescript2';

const loadConfig = function (folder: string, staging: string) {
  const configs = [
    YAML.safeLoad(readFileSync(folder + '/defaults.yaml').toString()),
    YAML.safeLoad(readFileSync(folder + '/' + staging + '.yaml').toString()),
  ];

  return deepMerge.apply(null, configs);
};

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
    `${root}/node_modules/@faasjs/provider-${name}/lib/index.js`,
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      resourceSdks[name as string] = require(path);
      return resourceSdks[name as string];
    }
  }

  throw Error(`Sdk load failed\nfind paths:\n${paths.join('\n')}`);
};

/**
 * 发布实例
 */
export default class Deployer {
  public name: string;
  public root: string;
  public file: string;
  public staging: string;
  public flow: Flow;
  public providers: any;
  public resources: any;
  public logger: Logger;

  /**
   * 创建发布实例
   * @param root {string} 根目录路径
   * @param file {string} 流程文件路径
   * @param staging {string} 发布环境，默认为 testing
   */
  constructor (root: string, file: string, staging?: string) {
    this.root = root;
    this.file = file;
    this.name = file.match(/([^/]+)\.flow\.ts$/)![1];
    this.flow = require(file).default;
    this.staging = staging || 'testing';

    const config = loadConfig(root + '/config/providers', this.staging);

    // 处理云函数的资源配置
    let resourceName = this.flow.config.resource!.name || config.resources.defaults.function;

    if (!resourceName || !config.resources[resourceName as string]) {
      throw Error('Not found resource: ' + resourceName);
    }

    this.flow.config.resource = deepMerge(config.resources[resourceName as string], this.flow.config.resource);

    if (typeof this.flow.config.resource!.provider === 'string') {
      this.flow.config.resource!.provider = config.providers[this.flow.config.resource!.provider];
    }

    this.providers = config.providers;
    this.resources = config.resources;
    this.logger = new Logger('@faasjs/deploy:' + this.name);
  }

  public async build () {
    this.logger.debug('build %s', this.file);

    const time = new Date().toLocaleString('zh-CN', {
      hour12: false,
      timeZone: 'Asia/Shanghai',
    }).replace(/(\/|:|\s)/g, '_');

    const tmpFolder = `${this.root}/tmp/functions/${this.name}/${time}`;

    this.logger.debug('解析云函数');

    const functions: any[] = [];
    const triggers: any[] = [];

    // 解析触发配置
    for (const type in this.flow.config.triggers) {
      if (this.flow.config.triggers.hasOwnProperty(type)) {
        // 增加触发函数
        const functionName = this.name + '_trigger_' + type;

        functions.push({
          key: -1,
          name: functionName,
          resource: this.flow.config.resource,
          type,
        });

        // 增加触发器
        const trigger = this.flow.config.triggers[type as string];
        const triggerResourceName = trigger.resourceName || this.resources.defaults[type as string];
        if (!this.resources[triggerResourceName as string]) {
          throw Error('provider resource not found: ' + triggerResourceName);
        }
        const triggerResource = deepMerge(
          this.resources[triggerResourceName as string],
          { name: triggerResourceName },
          trigger,
        );

        triggers.push({
          deploy: this,
          functionName,
          resource: triggerResource,
          type,
        });
      }
    }

    // 若未配置触发器且不是异步模式，则默认生成一个 invoke 触发器的云函数
    if (functions.length === 0 && this.flow.config.mode === 'sync') {
      functions.push({
        key: -1,
        name: this.name + '_invoke_-1',
        resource: this.flow.config.resource,
        type: 'invoke',
      });
    }

    // 异步模式的流程生成多个云函数
    if (this.flow.config.mode === 'async') {
      for (let i = 0; i < this.flow.steps.length; i++) {
        functions.push({
          key: i,
          name: this.name + '_invoke_' + i,
          resource: this.flow.config.resource,
          type: 'invoke',
        });
      }
    }

    this.logger.debug('解析完毕\n云函数：%o\n触发器：%o', functions, triggers);

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
          '@faasjs/flow-tencentcloud': '0.0.0-alpha.2',
        },
        name: func.name,
        private: true,
        version: time,
      };

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
          if (d.includes('node_modules') && !func.packageJSON.dependencies[d as string]) {
            console.log(d);
            func.packageJSON.dependencies[d as string] = '*';
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
 * @build ${time}
 */`,
        footer: `module.exports.config.name = '${this.name}';
module.exports.config.resource = ${JSON.stringify(this.flow.config.resource)};
module.exports.handler = module.exports.createTrigger('${func.type}', ${func.key});`
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
      this.logger.debug('开始发布云函数');

      const sdk = loadSdk(this.root, func.resource.type);
      await sdk.deploy(func.resource.provider, func);
    }

    for (const trigger of triggers) {
      this.logger.label = '@faasjs/deploy:' + trigger.type;
      this.logger.debug('开始发布触发器');

      const sdk = loadSdk(this.root, trigger.resource.type);
      await sdk.deploy(this.providers[trigger.resource.provider], trigger);
    }

    return true;
  }
}
