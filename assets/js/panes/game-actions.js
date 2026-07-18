/**
 * panes/game-actions.js — Compact Game Actions Pane
 *
 * Mode selector, Main Action, and End Game (Solve/Fail), plus a "..." menu
 * for Adjust Time, Checklist, and Emergency Controls. Companion to
 * `game-status`. Reads global PxD.config.gameControl (same as game-control).
 *
 * Multi-instance: no — do not place beside a full `game-control` pane.
 */
(function () {
    'use strict';

    function factory(config, ctx) {
        var _gc = (ctx.config && ctx.config.gameControl) || {};
        var _topicRoot = (ctx.config && ctx.config.topicRoot) || '';
        var _commandTopic = '';
        var _lastState = null;
        var _gameConfig = null;
        var _currentGame = null;
        var _lastHintGameMode = null;
        var _lastModeCommand = null;
        var _lastGameHeartbeat = 0;
        var _hbTimer = null;
        var _root = null;
        var _uid = 'ga' + Math.random().toString(36).slice(2, 8);

        function sendCommand(command, params) {
            var payload = Object.assign({ command: command }, params || {});
            ctx.mqtt.publish(_commandTopic, payload);
        }

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

        function q(sel) {
            return _root ? _root.querySelector(sel) : null;
        }

        function updateActionButton(gameState) {
            var btn = q('#gaActionBtn');
            if (!btn) return;
            var connected = (Date.now() - _lastGameHeartbeat) < (_gc.heartbeatTimeoutMs || 3000);
            var closing = isClosingState(_lastState);

            if (gameState === 'resetting') {
                btn.innerHTML = 'Start'; btn.className = 'btn btn-success w-100'; btn.disabled = true; return;
            }
            if (gameState === 'sleeping') {
                btn.innerHTML = 'Wake'; btn.className = 'btn btn-dark w-100'; btn.disabled = !connected; return;
            }
            if (closing) {
                btn.innerHTML = 'Reset'; btn.className = 'btn btn-warning w-100'; btn.disabled = !connected; return;
            }
            switch (gameState) {
                case 'ready':    btn.innerHTML = 'Start';  btn.className = 'btn btn-success w-100'; btn.disabled = !connected; break;
                case 'gameplay': btn.innerHTML = 'Pause';  btn.className = 'btn btn-warning w-100'; btn.disabled = !connected; break;
                case 'intro':    btn.innerHTML = 'Abort';  btn.className = 'btn btn-danger w-100';  btn.disabled = !connected; break;
                case 'paused':   btn.innerHTML = 'Resume'; btn.className = 'btn btn-info w-100';    btn.disabled = !connected; break;
                default:         btn.innerHTML = 'Start';  btn.className = 'btn btn-primary w-100'; btn.disabled = !connected;
            }
        }

        function updateControlStates(gameState) {
            var connected = (Date.now() - _lastGameHeartbeat) < (_gc.heartbeatTimeoutMs || 3000);
            var closing = isClosingState(_lastState);
            var sel = q('#gaSelect');
            if (sel) {
                var restricted = (gameState === 'intro' || gameState === 'gameplay' || gameState === 'resetting' || closing);
                sel.disabled = !(connected && !restricted);
            }
            var solveBtn = q('#gaSolveBtn');
            var failBtn = q('#gaFailBtn');
            if (solveBtn) solveBtn.disabled = !(connected && gameState === 'gameplay');
            if (failBtn) failBtn.disabled = !(connected && gameState === 'gameplay');
        }

        function disableAllControls() {
            ['gaSelect', 'gaActionBtn', 'gaSolveBtn', 'gaFailBtn'].forEach(function (id) {
                var el = q('#' + id);
                if (el) el.disabled = true;
            });
        }

        function applyGameSelection(gameId, options) {
            if (!_gameConfig || !_gameConfig.games || !gameId) return;
            var game = _gameConfig.games[gameId];
            if (typeof game !== 'object' || !game || !game.shortLabel) return;
            var sel = q('#gaSelect');
            if (sel && sel.value !== gameId) sel.value = gameId;
            var changed = _currentGame !== game;
            _currentGame = game;
            var refresh = options.refreshHints !== false && (changed || _lastHintGameMode !== gameId);
            if (refresh) {
                _lastHintGameMode = gameId;
                document.dispatchEvent(new CustomEvent('pxd:gameChanged', { detail: { game: game, gameId: gameId } }));
            }
            if (options.sendCommand) {
                if ((_lastState && _lastState.currentGameMode === gameId) || _lastModeCommand === gameId) return;
                sendCommand('setGameMode', { mode: gameId });
                _lastModeCommand = gameId;
            }
        }

        function populateGameSelector() {
            var sel = q('#gaSelect');
            if (!sel || !_gameConfig || !_gameConfig.games) return;
            sel.innerHTML = '';
            Object.keys(_gameConfig.games).forEach(function (id) {
                var g = _gameConfig.games[id];
                if (typeof g !== 'object' || !g || id === 'comment' || !g.shortLabel) return;
                var opt = document.createElement('option');
                opt.value = id; opt.text = g.shortLabel || id;
                sel.add(opt);
            });
            if (sel.options.length > 0) {
                var cur = _lastState && _lastState.currentGameMode;
                var target = (cur && _gameConfig.games[cur] && _gameConfig.games[cur].shortLabel) ? cur : sel.options[0].value;
                applyGameSelection(target, { sendCommand: false });
            }
        }

        function openChecklist() {
            var existing = document.getElementById('pxd-checklist-notice-modal');
            if (existing) existing.remove();

            var el = document.createElement('div');
            el.id = 'pxd-checklist-notice-modal';
            el.className = 'modal fade';
            el.setAttribute('tabindex', '-1');
            el.innerHTML =
                '<div class="modal-dialog modal-dialog-centered">' +
                  '<div class="modal-content">' +
                    '<div class="modal-header">' +
                      '<h5 class="modal-title">Checklist</h5>' +
                      '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                      'The checklist panel is a planned feature and will be available in a future update.' +
                    '</div>' +
                    '<div class="modal-footer">' +
                      '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Got It</button>' +
                    '</div>' +
                  '</div>' +
                '</div>';
            document.body.appendChild(el);
            el.addEventListener('hidden.bs.modal', function () { el.remove(); });
            try {
                new bootstrap.Modal(el).show();
            } catch (e) {
                alert('The checklist panel is a planned feature and will be available in a future update.');
                el.remove();
            }
        }

        function showModal(id) {
            var el = document.getElementById(id);
            if (el) new bootstrap.Modal(el).show();
        }

        function showAbortConfirmModal() {
            var el = document.getElementById(_uid + '-abort');
            if (!el) {
                if (confirm('Abort intro and reset game?')) sendAbortThenReset();
                return;
            }
            new bootstrap.Modal(el).show();
        }

        function confirmIntroAbort() {
            var el = document.getElementById(_uid + '-abort');
            if (el) { var m = bootstrap.Modal.getInstance(el); if (m) m.hide(); }
            sendAbortThenReset();
        }

        function sendAbortThenReset() {
            sendCommand('abort');
            setTimeout(function () { sendCommand('reset'); }, 500);
        }

        function emergencyAction(action) {
            var map = {
                abortGame:          { label: 'Abort Current Game',       command: 'abort',           toast: 'Abort initiated' },
                propsSleep:         { label: 'Put Props to Sleep',        command: 'sleep',           toast: 'Props sleep initiated' },
                propsWake:          { label: 'Wake Props Up',             command: 'wake',            toast: 'Props wake initiated' },
                restartAdapters:    { label: 'Restart Props Adapters',    command: 'restartAdapters', toast: 'Restart adapters initiated' },
                softwareRestart:    { label: 'Restart Software',         command: 'reboot',          toast: 'Software restart initiated' },
                softwareShutdown:   { label: 'Shutdown Software',        command: 'shutdown',        toast: 'Software shutdown initiated' },
                machineReboot:      { label: 'Reboot Room Controller',   command: 'machineReboot',   toast: 'Reboot initiated' },
                machineShutdown:    { label: 'Shutdown Room Controller', command: 'machineShutdown', toast: 'Shutdown initiated' }
            };
            var sel = map[action];
            if (!sel) return;
            if (!confirm('Confirm: ' + sel.label + '?')) return;
            var el = document.getElementById(_uid + '-emergency');
            if (el) { var m = bootstrap.Modal.getInstance(el); if (m) m.hide(); }
            if (action === 'abortGame') sendAbortThenReset();
            else sendCommand(sel.command);
            PxD.utils.showToast(sel.toast);
        }

        function sendGameAction() {
            var btn = q('#gaActionBtn');
            if (!btn || btn.disabled) return;
            var gs = _lastState ? _lastState.gameState : 'ready';
            if (isClosingState(_lastState)) { sendCommand('reset'); return; }
            switch (gs) {
                case 'ready':    sendCommand('start');  break;
                case 'gameplay': sendCommand('pause');  break;
                case 'intro':    showAbortConfirmModal(); break;
                case 'paused':   sendCommand('resume'); break;
                case 'sleeping': sendCommand('wake');   break;
                default:         sendCommand('start');
            }
        }

        function clampMinutes(value) {
            var n = parseInt(value, 10);
            if (isNaN(n) || n < 0) return 0;
            if (n > 60) return 60;
            return n;
        }

        function minutesSelect() {
            return document.getElementById(_uid + '-minutes');
        }

        function stepMinutes(delta) {
            var mi = minutesSelect();
            if (!mi) return;
            mi.value = String(clampMinutes((parseInt(mi.value, 10) || 0) + delta));
        }

        function validateTimeSelects() {
            var mi = minutesSelect();
            if (mi) mi.value = String(clampMinutes(mi.value));
        }

        function resetTimeSelects() {
            var mi = minutesSelect();
            if (mi) mi.value = '0';
        }

        function adjustTime(direction) {
            var mi = minutesSelect();
            var mins = clampMinutes((mi && mi.value) || '0');
            var total = mins * 60 * direction;
            if (total === 0) return;
            sendCommand('adjustTime', { seconds: total });
            resetTimeSelects();
        }

        function buildTimeOptions() {
            var html = '';
            for (var i = 0; i <= 60; i++) {
                html += '<option value="' + i + '">' + String(i).padStart(2, '0') + '</option>';
            }
            return html;
        }

        function emergencyBtn(action, cssClass, label) {
            return '<div class="col-12"><button type="button" class="btn btn-lg w-100 ' + cssClass + '" ' +
                'data-ga-emer="' + action + '">' + label + '</button></div>';
        }

        function buildModalsHTML() {
            var timeOpts = buildTimeOptions();
            return '' +
            '<div class="modal fade" id="' + _uid + '-time" tabindex="-1" aria-hidden="true">' +
                '<div class="modal-dialog modal-dialog-centered">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<h5 class="modal-title">Adjust Time</h5>' +
                            '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        '</div>' +
                        '<div class="modal-body">' +
                            '<div class="gc-time-row">' +
                                '<div class="input-group input-group-sm gc-time-group">' +
                                    '<button class="btn btn-outline-secondary" type="button" data-ga-step="-1" aria-label="Decrease minutes">-</button>' +
                                    '<select id="' + _uid + '-minutes" class="form-select text-center" aria-label="Minutes">' + timeOpts + '</select>' +
                                    '<button class="btn btn-outline-secondary" type="button" data-ga-step="1" aria-label="Increase minutes">+</button>' +
                                '</div>' +
                                '<span class="gc-time-unit" aria-hidden="true">min</span>' +
                                '<div class="btn-group gc-time-apply" role="group" aria-label="Apply time adjustment">' +
                                    '<button type="button" class="btn btn-outline-light btn-sm" data-ga-adj="-1" title="Subtract minutes">\u2212</button>' +
                                    '<button type="button" class="btn btn-outline-light btn-sm" data-ga-adj="1" title="Add minutes">+</button>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="modal fade" id="' + _uid + '-emergency" tabindex="-1" aria-hidden="true">' +
                '<div class="modal-dialog modal-dialog-centered">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header bg-danger text-white">' +
                            '<h5 class="modal-title">Emergency Controls</h5>' +
                            '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        '</div>' +
                        '<div class="modal-body"><div class="row g-2">' +
                            emergencyBtn('abortGame', 'emergency-btn-abort', 'Abort Current Game') +
                            emergencyBtn('propsSleep', 'emergency-btn-sleep', 'Put Props to Sleep') +
                            emergencyBtn('propsWake', 'emergency-btn-wake', 'Wake Props Up') +
                            emergencyBtn('restartAdapters', 'emergency-btn-restart-adapters', 'Restart Props Adapters') +
                            emergencyBtn('softwareRestart', 'emergency-btn-restart-software', 'Restart Software') +
                            emergencyBtn('softwareShutdown', 'emergency-btn-shutdown-software', 'Shutdown Software') +
                            emergencyBtn('machineReboot', 'emergency-btn-reboot-controller', 'Reboot Room Controller') +
                            emergencyBtn('machineShutdown', 'emergency-btn-shutdown-controller', 'Shutdown Room Controller') +
                        '</div></div>' +
                        '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="modal fade" id="' + _uid + '-abort" tabindex="-1" aria-hidden="true">' +
                '<div class="modal-dialog modal-dialog-centered">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header bg-danger text-white">' +
                            '<h5 class="modal-title">Confirm Abort</h5>' +
                            '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        '</div>' +
                        '<div class="modal-body">Abort intro and run reset?</div>' +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="button" class="btn btn-danger" data-ga-confirm-abort>Abort + Reset</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }

        function onGameState(payload) {
            _lastState = payload;
            _lastGameHeartbeat = Date.now();
            var gs = payload.gameState || '';
            updateActionButton(gs);
            updateControlStates(gs);
            if (payload.currentGameMode) applyGameSelection(payload.currentGameMode, { sendCommand: false });
            if (_lastModeCommand && payload.currentGameMode === _lastModeCommand) _lastModeCommand = null;
        }

        function onGameConfig(payload) {
            _gameConfig = payload;
            if (payload && typeof payload.hintTopic === 'string' && payload.hintTopic.trim()) {
                document.dispatchEvent(new CustomEvent('pxd:hintTopicChanged', {
                    detail: { hintTopic: payload.hintTopic.trim() }
                }));
            }
            populateGameSelector();
        }

        function wireEvents() {
            var sel = q('#gaSelect');
            if (sel) {
                sel.addEventListener('change', function () {
                    applyGameSelection(sel.value, { sendCommand: true });
                });
            }
            var action = q('#gaActionBtn');
            if (action) action.addEventListener('click', sendGameAction);
            var solve = q('#gaSolveBtn');
            if (solve) solve.addEventListener('click', function () { sendCommand('solve'); });
            var fail = q('#gaFailBtn');
            if (fail) fail.addEventListener('click', function () { sendCommand('fail'); });

            _root.querySelectorAll('[data-ga-menu]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var act = btn.getAttribute('data-ga-menu');
                    if (act === 'time') showModal(_uid + '-time');
                    else if (act === 'checklist') openChecklist();
                    else if (act === 'emergency') showModal(_uid + '-emergency');
                });
            });

            var timeModal = document.getElementById(_uid + '-time');
            var emerModal = document.getElementById(_uid + '-emergency');
            var abortModal = document.getElementById(_uid + '-abort');
            if (timeModal) {
                timeModal.querySelectorAll('[data-ga-step]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        stepMinutes(parseInt(btn.getAttribute('data-ga-step'), 10) || 0);
                    });
                });
                timeModal.querySelectorAll('[data-ga-adj]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        adjustTime(parseInt(btn.getAttribute('data-ga-adj'), 10) || 0);
                    });
                });
                var mins = minutesSelect();
                if (mins) mins.addEventListener('change', validateTimeSelects);
            }
            if (emerModal) {
                emerModal.querySelectorAll('[data-ga-emer]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        emergencyAction(btn.getAttribute('data-ga-emer'));
                    });
                });
            }
            if (abortModal) {
                var abortBtn = abortModal.querySelector('[data-ga-confirm-abort]');
                if (abortBtn) abortBtn.addEventListener('click', confirmIntroAbort);
            }
        }

        return {
            mount: function (el) {
                _root = el;
                _commandTopic = topic('commands', _gc.commandTopic);

                el.innerHTML =
                    '<section class="panel panel-game-actions">' +
                        '<div class="ga-controls">' +
                            '<div class="control-item">' +
                                '<div class="ga-mode-row">' +
                                    '<select id="gaSelect" class="form-select" aria-label="Game mode">' +
                                        '<option value="">Loading\u2026</option>' +
                                    '</select>' +
                                    '<div class="dropdown">' +
                                        '<button type="button" class="btn btn-outline-secondary ga-more-btn" ' +
                                            'data-bs-toggle="dropdown" aria-expanded="false" title="More" aria-label="More options">\u22EE</button>' +
                                        '<ul class="dropdown-menu dropdown-menu-end">' +
                                            '<li><button type="button" class="dropdown-item" data-ga-menu="time">Adjust Time</button></li>' +
                                            '<li><button type="button" class="dropdown-item" data-ga-menu="checklist">Open Checklist</button></li>' +
                                            '<li><hr class="dropdown-divider"></li>' +
                                            '<li><button type="button" class="dropdown-item text-danger" data-ga-menu="emergency">Emergency Controls</button></li>' +
                                        '</ul>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="control-item control-item-action">' +
                                '<button id="gaActionBtn" type="button" class="btn btn-primary w-100" disabled aria-label="Main action">Start</button>' +
                            '</div>' +
                            '<div class="control-item">' +
                                '<div class="btn-group w-100" role="group" aria-label="End game">' +
                                    '<button id="gaSolveBtn" type="button" class="btn btn-success" disabled>Solve</button>' +
                                    '<button id="gaFailBtn" type="button" class="btn btn-danger" disabled>Fail</button>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</section>';

                var portal = document.getElementById('pxd-modals');
                if (portal) portal.insertAdjacentHTML('beforeend', buildModalsHTML());
                wireEvents();

                var stateTopic = topic('state', _gc.stateTopic);
                var configTopic = topic('config', _gc.configTopic);
                ctx.mqtt.subscribe(stateTopic, onGameState);
                ctx.mqtt.subscribe(configTopic, onGameConfig);

                _hbTimer = setInterval(function () {
                    var connected = (Date.now() - _lastGameHeartbeat) < (_gc.heartbeatTimeoutMs || 3000);
                    if (!connected) {
                        updateActionButton('disconnected');
                        disableAllControls();
                    }
                }, 250);

                ctx.mqtt.publish(_commandTopic, { command: 'getConfig' });
            },
            unmount: function () {
                clearInterval(_hbTimer);
                _hbTimer = null;
                ['-time', '-emergency', '-abort'].forEach(function (suffix) {
                    var el = document.getElementById(_uid + suffix);
                    if (el) el.remove();
                });
                if (_root) _root.innerHTML = '';
                _root = null;
            }
        };
    }

    PxD.panes.registerType('game-actions', factory);
})();
