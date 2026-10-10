/**
 * CSInterface - v11.0.0
 * Adobe CEP official communication bridge
 */
(function () {
  'use strict';

  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    if (window.__adobe_cep__) {
      window.__adobe_cep__.evalScript(script, callback);
    } else if (callback) {
      callback('null');
    }
  };

  CSInterface.prototype.closeExtension = function () {
    if (window.__adobe_cep__) {
      window.__adobe_cep__.closeExtension();
    }
  };

  window.CSInterface = CSInterface;
})();
