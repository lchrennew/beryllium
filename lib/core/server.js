import { error, FileLogger, rootLogger, SimpleInterface } from '@adobe/helix-log'
import fse from 'fs-extra'
import http from 'http'
import { createHttpTerminator } from 'http-terminator'
import https from 'https'
import _ from 'lodash'
import path from 'path'
import pem from 'pem'
import { promisify } from 'util'
import app from '../app'
import * as git from './git'
import { resolveRepositoryPath } from './utils'

const DEFAULT_REPO_ROOT = './repos';
const DEFAULT_HTTP_PORT = 5000;
const DEFAULT_HTTPS_PORT = 5443;
const DEFAULT_HOST = '0.0.0.0';
const createCertificate = promisify(pem.createCertificate);


process.on('uncaughtException', (err) => {
  error('encountered uncaught exception at process level', err);
  // in case of fatal errors which cause process termination errors sometimes don't get logged:
  // => print error directly to console
  /* eslint no-console: off */
  console.log('encountered uncaught exception at process level', err);
});

process.on('unhandledRejection', (reason, p) => {
  error(`encountered unhandled promise rejection at process level: ${p}, reason: ${reason.stack || reason}`);
});

/**
 * Current state of the server
 */
const serverState = {
  httpSrv: null,
  httpsSrv: null,
  logger: null,
};

const applyDefaults = options => {
  const opts = options || {};
  opts.repoRoot = opts.repoRoot || DEFAULT_REPO_ROOT;
  opts.virtualRepos = opts.virtualRepos || {};

  opts.listen = opts.listen || {};
  opts.listen.http = _.defaults(opts.listen.http, {
    port: DEFAULT_HTTP_PORT,
    host: DEFAULT_HOST,
  });
  if (opts.listen.https) {
    opts.listen.https = _.defaults(opts.listen.https, {
      port: DEFAULT_HTTPS_PORT,
      host: DEFAULT_HOST,
    });
  }
  return opts;
};

const initConfiguration = async rawConfig => {
  try {
    const config = applyDefaults(rawConfig);

    // root dir of repositories
    config.repoRoot = path.resolve(config.repoRoot);
    await fse.ensureDir(config.repoRoot);

    if (!config.logger) {
      // configure logger
      config.logs = config.logs || {};
      config.logs.logsDir = path.normalize(config.logs.logsDir || 'logs');

      await fse.ensureDir(config.logs.logsDir);
      rootLogger.loggers.set( // Using a uuid in the name here makes collisions extremely unlikely
        'git-server-errors-6ae5f55e-dbb3-46a0-a596-c238e713c1cc',
        new FileLogger(path.resolve(config.logs.logsDir, 'error.log')),
      );
      config.logger = new SimpleInterface({
        level: config.logs.level || 'info',
      });
    }
    serverState.logger = config.logger;
    config.logger.debug(`configuration successfully read: ${config.configPath}`);

    return config;
  } catch (e) {
    throw new Error(`unable to initialize the configuration: ${e.message}`);
  }
};

const readConfiguration = async () => {
  try {
    let configPath = path.join(__dirname, 'config.js');

    const exists = await fse.pathExists(configPath);
    if (!exists) {
      configPath = path.join(process.cwd(), 'config.js');
    }

    /* eslint-disable global-require */
    /* eslint-disable import/no-dynamic-require */
    const config = require(configPath);
    config.configPath = configPath;
    return config;
  } catch (e) {
    throw new Error(`unable to read the configuration: ${e.message}`);
  }
};

const startHttpServer = async config => {
  const { host, port } = config.listen.http;
  const srv = http.createServer(app(config).callback())
  await new Promise((resolve, reject) => {
    srv.listen(port, host, err => {
      if (err) {
        reject(new Error(`unable to start start http server: ${err.message}`))
      } else resolve()
    })
  })
  config.logger.info(`[${process.pid}] HTTP: listening on port ${srv.address().port}`)
  return srv
};

const startHttpsServer = async config => {
  const { host, port, key, cert, } = config.listen.https;

  try {
    let options;
    if (key && cert) {
      options = {
        key: await fse.readFile(key, 'utf8'),
        cert: await fse.readFile(cert, 'utf8'),
      };
    } else {
      const keys = await createCertificate({ selfSigned: true });
      options = {
        key: keys.serviceKey,
        cert: keys.certificate,
      };
    }

    const srv = https.createServer(options, app(config).callback())
    await new Promise((resolve, reject) => {
      srv.listen(port, host, err => {
          if (err) {
            reject(new Error(`unable to start start https server: ${err.message}`));
          } else {
            resolve();
          }
        });
    });
    config.logger.info(`[${process.pid}] HTTPS: listening on port ${srv.address().port}`);
    return srv;
  } catch (e) {
    throw new Error(`unable to start start https server: ${e.message}`);
  }
};

const stopServer = async ({
  server, terminator, protocol, logger,
}) => {
  if (!server || !terminator) {
    return;
  }
  try {
    await terminator.terminate();
  } catch (err) {
    throw new Error(`Error while stopping ${protocol} server: ${err}`);
  }
  logger.info(`${protocol}: server stopped.`);
};

export const start = async rawConfig => {
  const cfg = rawConfig || await readConfiguration();
  try{
    const config = await initConfiguration(cfg)
    let server = await startHttpServer(config);
    serverState.http = {
      server,
      terminator: createHttpTerminator({ server })
    };
    // issue #218: https is optional
    if (config.listen.https) {
      server = await startHttpsServer(config);
      serverState.https = {
        server,
        terminator: createHttpTerminator({ server })
      };
    }
    return {
      httpPort: serverState.http.server.address().port,
      httpsPort: serverState.https ? serverState.https.server.address().port : -1,
    };
  } catch (err) {
    const msg = `error during startup, exiting... : ${err.message}`;
    serverState.logger.error(msg);
    throw Error(msg);
  }
};

export const getRepoInfo = async (rawConfig, owner, repo) => {
  const cfg = rawConfig || await readConfiguration();
  const repPath = resolveRepositoryPath(await initConfiguration(cfg), owner, repo);
  const currentBranch = await git.currentBranch(repPath);
  return {
    owner,
    repo,
    currentBranch
  };
};

export const stop = async () => {
  const { logger } = serverState;
  if (serverState.http) {
    await stopServer({
      ...serverState.http,
      logger,
      protocol: 'http'
    });
    delete serverState.http;
  }
  if (serverState.https) {
    await stopServer({
      ...serverState.https,
      logger,
      protocol: 'https'
    });
    delete serverState.https;
  }
};
