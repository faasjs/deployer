import Flow from '@faasjs/flow';

export default new Flow(
  {
    mode: 'async',
  },
  function (prev: any) {
    return prev + 1;
  },
  function (prev: any) {
    return prev + 2;
  },
);
