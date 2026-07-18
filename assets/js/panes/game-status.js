/**
 * panes/game-status.js — Game Status Pane
 *
 * Large time/status pill only (no title, no controls). Intended as a
 * quarter-width companion to `game-actions` and a half-width logo `content`
 * pane. Reads global PxD.config.gameControl (same topics as game-control).
 *
 * Multi-instance: no — shares the room gameControl config. Do not place
 * beside a full `game-control` pane on the same page (duplicate MQTT UI is
 * fine; prefer one control surface).
 */
(function () {
    'use strict';

    function factory(config, ctx) {
        var _gc = (ctx.config && ctx.config.gameControl) || {};
        var _topicRoot = (ctx.config && ctx.config.topicRoot) || '';
        var _lastState = null;
        var _lastGameHeartbeat = 0;
        var _hbTimer = null;
        var _root = null;

        function topic(suffix, override) {
            return override || (_topicRoot + '/' + suffix);
        }

        function isClosingState(state) {
            if (!state) return false;
            if (state.isClosingPhase === true) return true;
            var pt = (state.phaseType || '').toLowerCase();
            if (pt === 'solved' || pt === 'failed') return true;
            var gs = (state.gameState || '').toLowerCase();
            return gs === 'solved' || gs === 'failed' || gs === 'abort';
        }

        function updateGameStatus(gameState, timeLeft) {
            var el = _root && _root.querySelector('#gsStatus');
            if (!el) return;
            var connected = (Date.now() - _lastGameHeartbeat) < (_gc.heartbeatTimeoutMs || 3000);
            var closing = isClosingState(_lastState);
            var bg = '', fg = '', text = '';

            if (!connected) {
                bg = '#ffff00'; fg = '#000'; text = 'Disconnected!';
            } else {
                switch (gameState) {
                    case 'ready':      bg = '#ffffff'; fg = '#000000'; text = 'Ready!'; break;
                    case 'intro':      bg = '#f8f9fa'; fg = '#000000'; text = 'Intro ' + (timeLeft || '00:00'); break;
                    case 'gameplay':   bg = '#f8f9fa'; fg = '#000000'; text = 'Time left ' + (timeLeft || '00:00'); break;
                    case 'paused':     bg = '#fff3cd'; fg = '#000000'; text = 'Paused at ' + (timeLeft || '00:00'); break;
                    case 'solved':     bg = '#28a745'; fg = '#ffffff'; text = 'Solved! ' + (timeLeft || '00:00'); break;
                    case 'failed':     bg = '#dc3545'; fg = '#ffffff'; text = 'Failed! ' + (timeLeft || '00:00'); break;
                    case 'resetting':  bg = '#343a40'; fg = '#ffffff'; text = 'Resetting...'; break;
                    case 'sleeping':   bg = '#343a40'; fg = '#ffffff'; text = 'Sleeping...'; break;
                    case 'abort':      bg = '#dc3545'; fg = '#ffffff'; text = 'Aborted \u2014 Reset!'; break;
                    default:
                        if (closing) { bg = '#6c757d'; fg = '#ffffff'; text = 'Closing ' + (timeLeft || '00:00'); }
                        else { bg = '#e2e3e5'; fg = '#000000'; text = gameState + (timeLeft ? ' ' + timeLeft : ''); }
                }
            }
            el.style.backgroundColor = bg;
            el.style.color = fg;
            el.textContent = text;
        }

        function onGameState(payload) {
            _lastState = payload;
            _lastGameHeartbeat = Date.now();
            updateGameStatus(payload.gameState || '', payload.timeLeft || '00:00');
        }

        return {
            mount: function (el) {
                _root = el;
                el.innerHTML =
                    '<section class="panel panel-game-status">' +
                        '<div id="gsStatus" class="alert alert-info gs-status-pill mb-0">Connecting...</div>' +
                    '</section>';

                var stateTopic = topic('state', _gc.stateTopic);
                ctx.mqtt.subscribe(stateTopic, onGameState);

                _hbTimer = setInterval(function () {
                    var connected = (Date.now() - _lastGameHeartbeat) < (_gc.heartbeatTimeoutMs || 3000);
                    if (!connected) updateGameStatus('disconnected', '00:00');
                }, 250);
            },
            unmount: function () {
                clearInterval(_hbTimer);
                _hbTimer = null;
                if (_root) _root.innerHTML = '';
                _root = null;
            }
        };
    }

    PxD.panes.registerType('game-status', factory);
})();
