/*
 * Power-Up connector: registers capabilities with Trello.
 * This file runs in the hidden connector iframe (index.html) that Trello
 * loads for every board where the Power-Up is enabled.
 */
(function () {
  'use strict';

  var ICONS = {
    dark: new URL('./icons/tag-light.svg', window.location.href).href,  // shown on dark backgrounds
    light: new URL('./icons/tag-dark.svg', window.location.href).href,  // shown on light backgrounds
  };

  // Absolute URL of the swatch icon for a label color (see card-badges).
  function swatchUrl(color) {
    var name = color && window.LM_LABELS.COLOR_ORDER.indexOf(color) !== -1 ? color : 'none';
    return new URL('./icons/swatches/' + name + '.svg', window.location.href).href;
  }

  function openManager(t) {
    return t.modal({
      url: window.LM_CONFIG.propagate('./manager.html'),
      title: 'Label Manager — custom label order',
      fullscreen: false,
      height: 680,
    });
  }

  function openPicker(t) {
    return t.popup({
      title: 'Labels — your order',
      url: window.LM_CONFIG.propagate('./picker.html'),
      height: 420,
    });
  }

  function openSettings(t) {
    return t.popup({
      title: 'Label Manager settings',
      url: window.LM_CONFIG.propagate('./settings.html'),
      height: 280,
    });
  }

  window.LM_BOOT.then(function (TrelloPowerUp) {
    var capabilities = {
      'board-buttons': function (t) {
        return [{
          icon: ICONS,
          text: 'Label Order',
          condition: 'edit',
          callback: openManager,
        }];
      },
      'card-buttons': function (t) {
        return [{
          icon: ICONS.light,
          text: 'Labels (your order)',
          condition: 'edit',
          callback: openPicker,
        }];
      },

      /*
       * Trello's own label row on the card back is sorted by color and is not
       * ours to change, so we render the same labels in the board's custom
       * order alongside it.
       */
      'card-back-section': function (t) {
        return {
          title: 'Labels — your order',
          icon: ICONS.light,
          content: {
            type: 'iframe',
            url: t.signUrl(window.LM_CONFIG.propagate('./card-section.html')),
            height: 52,
          },
          action: {
            text: 'Edit',
            callback: openPicker,
          },
        };
      },

      /*
       * Optional card-front badges in custom order (off by default — the
       * native chips are already there, so this is duplication the board has
       * to opt into from the settings popup).
       *
       * A badge's `color` may only be one of ten base names, which would
       * render subtle/normal/bold variants identically and misstate the
       * label. So the badge stays neutral and carries a swatch icon in the
       * label's exact palette color instead. Icons must be absolute URLs —
       * they are rendered by Trello's page, not from inside our iframe.
       */
      'card-badges': function (t) {
        return t.get('board', 'shared', 'showBadges', false).then(function (enabled) {
          if (!enabled) return [];
          return Promise.all([t.card('labels'), window.LM_ORDER.loadOrder(t)]).then(function (res) {
            var onCard = res[0].labels || [];
            if (!onCard.length) return [];
            return window.LM_ORDER.applyOrder(onCard, res[1]).map(function (label) {
              return {
                text: label.name || window.LM_LABELS.colorInfo(label.color).name,
                icon: swatchUrl(label.color),
              };
            });
          });
        });
      },

      'show-settings': openSettings,
    };

    if (window.LM_CONFIG.hasRest()) {
      capabilities['authorization-status'] = function (t) {
        return t.getRestApi().isAuthorized().then(function (authorized) {
          return { authorized: authorized };
        });
      };
      capabilities['show-authorization'] = openSettings;
    }

    var initOpts = {};
    if (window.LM_CONFIG.hasRest()) {
      initOpts.appKey = window.LM_CONFIG.APP_KEY;
      initOpts.appName = window.LM_CONFIG.APP_NAME;
    }

    TrelloPowerUp.initialize(capabilities, initOpts);
  }).catch(function (err) {
    console.error('Label Manager connector failed to start:', err);
  });
})();
