'use strict';

module.exports = {
  appTitle: 'CEBTECH Git Server',
  repoRoot: './repos',
  // repository mapping. allows to 'mount' repositories outside the 'repoRoot' structure.
  virtualRepos: {
    demoOwner: {
      demoRepo: {
        path: './virtual/example',
      },
    },
  },
  listen: {
    http: {
      port: 5000,
      host: '0.0.0.0',
    },
    /*
    // https is optional
    https: {
      // cert: if no file is specfied a selfsigned certificate will be generated on-the-fly
      // cert: './localhost.crt',
      // key: if no file is specfied a key will be generated on-the-fly
      // key: './localhost.key',
      port: 5443,
      host: '0.0.0.0',
    },
    */
  },
  subdomainMapping: {
    // if enabled, <subdomain>.<baseDomain>/foo/bar/baz will be
    // resolved/mapped to 127.0.0.1/<subdomain>/foo/bar/baz
    enable: true,
    baseDomains: [
      // some wildcarded DNS domains resolving to 127.0.0.1
      'localtest.me',
      'lvh.me',
      'vcap.me',
      'lacolhost.com',
    ],
  },
  logs: {
    level: 'info', // fatal, error, warn, info, verbose, debug, trace
    logsDir: './logs',
    reqLogFormat: 'short', // used for morgan (request logging)
  },
};
