import Flow from '@faasjs/flow';

export default new Flow(
  {
    mode: 'async',
    triggers: {
      http: {
        path: '/async'
      },
    },
  },
  function () {
    return 1;
  },
);
