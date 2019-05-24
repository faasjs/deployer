import Flow from '@faasjs/flow';

export default new Flow(
  {
    triggers: {
      http: {},
    },
  },
  function () {
    return 1;
  },
);
