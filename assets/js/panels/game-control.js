/**
 * panels/game-control.js — Game Control Panel
 *
 * Responsibilities:
 *  - Render the game state status pill and time-left display
 *  - Mode selector (game modes from MQTT config)
 *  - Start / Pause / Resume / Solve / Fail / Reset / Wake action button
 *  - Checklist button (state driven by MQTT; currently a stub)
 *  - Emergency controls modal
 *  - Abort intro confirmation modal
 *
 * Reads from: PxD.config.gameControl, PxD.config.topicRoot
 * Publishes to: gameControl.commandTopic (default: topicRoot/commands)
 * Subscribes to: stateTopic, configTopic, checklistStateTopic
 */
(function () {
    'use strict';

    // ── Panel-local state ──────────────────────────────────────────────────
    var _config = null;           // room.json gameControl section
    var _topicRoot = '';
    var _commandTopic = '';

    var _lastState = null;        // last game state payload
    var _gameConfig = null;       // last game config payload (modes, hints)
    var _currentGame = null;      // selected game object
    var _lastHintGameMode = null;
    var _lastModeCommand = null;
    var _lastGameHeartbeat = 0;
    var _hbTimer = null;
    var _hintTopic = '';          // may be overridden by config message

    var _checklistState = null;

    // DOM refs (set by mount)
    var _root = null;

    // ── Helper: send a command ─────────────────────────────────────────────
    function sendCommand(command, params) {
        var payload = Object.assign({ command: command }, params || {});
        PxD.mqtt.publish(_commandTopic, payload);
    }

    // ── Derive topic from root (with optional override) ────────────────────
    function topic(suffix, override) {
        return override || (_topicRoot + '/' + suffix);
    }

    // ── Determine if state is a "closing" phase ────────────────────────────
    function isClosingState(state) {
        if (!state) return false;
        if (state.isClosingPhase === true) return true;
        var pt = (state.phaseType || '').toLowerCase();
        if (pt === 'solved' || pt === 'failed') return true;
        var gs = (state.gameState || '').toLowerCase();
        return gs === 'solved' || gs === 'failed' || gs === 'abort';
    }

    // ── UI: game status pill ───────────────────────────────────────────────
    function updateGameStatus(gameState, timeLeft) {
        var el = _root.querySelector('#gameStatus');
        if (!el) return;
        var connected = (Date.now() - _lastGameHeartbeat) < (_config.heartbeatTimeoutMs || 3000);
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
        el.innerHTML = text;
    }

    // ── UI: action button label/state ──────────────────────────────────────
    function updateActionButton(gameState) {
        var btn = _root.querySelector('#gameActionBtn');
        if (!btn) return;
        var connected = (Date.now() - _lastGameHeartbeat) < (_config.heartbeatTimeoutMs || 3000);
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

    // ── UI: enable/disable controls ────────────────────────────────────────
    function updateControlStates(gameState) {
        var connected = (Date.now() - _lastGameHeartbeat) < (_config.heartbeatTimeoutMs || 3000);
        var closing = isClosingState(_lastState);

        // Game mode selector
        var sel = _root.querySelector('#gameSelect');
        if (sel) {
            var restricted = (gameState === 'intro' || gameState === 'gameplay' || gameState === 'resetting' || closing);
            sel.disabled = !(connected && !restricted);
        }

        // Solve/Fail
        var solveBtn = _root.querySelector('#solveBtn');
        var failBtn  = _root.querySelector('#failBtn');
        if (solveBtn) solveBtn.disabled = !(connected && gameState === 'gameplay');
        if (failBtn)  failBtn.disabled  = !(connected && gameState === 'gameplay');

        // Emergency
        var emerBtn = _root.querySelector('#emergencyBtn');
        if (emerBtn) emerBtn.disabled = !connected;

        // Checklist
        var checklistBtn = _root.querySelector('#checklistBtn');
        if (checklistBtn) checklistBtn.disabled = false; // always accessible
    }

    // ── UI: disable all interactive controls (disconnected state) ─────────
    function disableAllControls() {
        ['gameSelect', 'gameActionBtn', 'solveBtn', 'failBtn', 'emergencyBtn'].forEach(function (id) {
            var el = _root.querySelector('#' + id);
            if (el) el.disabled = true;
        });
    }

    // ── Game mode selector ─────────────────────────────────────────────────
    function populateGameSelector() {
        var sel = _root.querySelector('#gameSelect');
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

    function updateGameSelector(currentGameMode) {
        if (!currentGameMode || !_gameConfig || !_gameConfig.games) return;
        applyGameSelection(currentGameMode, { sendCommand: false });
    }

    function applyGameSelection(gameId, options) {
        if (!_gameConfig || !_gameConfig.games || !gameId) return;
        var game = _gameConfig.games[gameId];
        if (typeof game !== 'object' || !game || !game.shortLabel) return;
        var sel = _root.querySelector('#gameSelect');
        if (sel && sel.value !== gameId) sel.value = gameId;
        var changed = _currentGame !== game;
        _currentGame = game;
        // Refresh hint panel on game change (cross-panel signal via custom event)
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

    // ── Checklist ──────────────────────────────────────────────────────────
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
            var modal = new bootstrap.Modal(el);
            modal.show();
        } catch (e) {
            alert('The checklist panel is a planned feature and will be available in a future update.');
            el.remove();
        }
    }

    function handleChecklistState(state) {
        _checklistState = state;
        var btn = _root && _root.querySelector('#checklistBtn');
        if (!btn) return;
        var notReady = (state.items || []).filter(function (i) { return i.enabled === true && i.ready === false; });
        if (state.overrideManual || state.overrideAuto) {
            btn.className = 'btn btn-warning w-100';
            btn.title = 'Checklist overridden (' + notReady.length + ' not ready)';
        } else if (notReady.length > 0) {
            btn.className = 'btn btn-danger w-100';
            btn.title = notReady.length + ' checklist items not ready';
        } else if (state.allReady) {
            btn.className = 'btn btn-success w-100';
            btn.title = 'All checklist items ready';
        } else {
            btn.className = 'btn btn-info w-100';
            btn.title = 'Open checklist';
        }
    }

    // ── Emergency controls ─────────────────────────────────────────────────
    function showEmergencyModal() {
        var el = document.getElementById('gc-emergencyModal');
        if (el) new bootstrap.Modal(el).show();
    }

    function showAbortConfirmModal() {
        var el = document.getElementById('gc-abortConfirmModal');
        if (!el) { if (confirm('Abort intro and reset game?')) { sendAbortThenReset(); } return; }
        new bootstrap.Modal(el).show();
    }

    function confirmIntroAbort() {
        var el = document.getElementById('gc-abortConfirmModal');
        if (el) { var m = bootstrap.Modal.getInstance(el); if (m) m.hide(); }
        sendAbortThenReset();
    }

    function sendAbortThenReset() {
        sendCommand('abort');
        setTimeout(function () { sendCommand('reset'); }, 500);
    }

    function emergencyAction(action) {
        var map = {
            abortGame:          { label: 'Abort Current Game',       command: 'abort',          toast: 'Abort initiated' },
            propsSleep:         { label: 'Put Props to Sleep',        command: 'sleep',          toast: 'Props sleep initiated' },
            propsWake:          { label: 'Wake Props Up',             command: 'wake',           toast: 'Props wake initiated' },
            restartAdapters:    { label: 'Restart Props Adapters',    command: 'restartAdapters',toast: 'Restart adapters initiated' },
            softwareRestart:    { label: 'Restart Software',         command: 'reboot',         toast: 'Software restart initiated' },
            softwareShutdown:   { label: 'Shutdown Software',        command: 'shutdown',       toast: 'Software shutdown initiated' },
            machineReboot:      { label: 'Reboot Room Controller',   command: 'machineReboot',  toast: 'Reboot initiated' },
            machineShutdown:    { label: 'Shutdown Room Controller', command: 'machineShutdown',toast: 'Shutdown initiated' }
        };
        var sel = map[action];
        if (!sel) return;
        if (!confirm('Confirm: ' + sel.label + '?')) return;
        var el = document.getElementById('gc-emergencyModal');
        if (el) { var m = bootstrap.Modal.getInstance(el); if (m) m.hide(); }
        if (action === 'abortGame') { sendAbortThenReset(); }
        else { sendCommand(sel.command); }
        PxD.utils.showToast(sel.toast);
    }

    // ── Game action button (main start/pause/etc.) ─────────────────────────
    function sendGameAction() {
        var btn = _root.querySelector('#gameActionBtn');
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

    // ── MQTT handlers ──────────────────────────────────────────────────────
    function onGameState(payload) {
        _lastState = payload;
        _lastGameHeartbeat = Date.now();
        var gs = payload.gameState || '';
        var tl = payload.timeLeft || '00:00';
        updateGameStatus(gs, tl);
        updateActionButton(gs);
        updateControlStates(gs);
        updateGameSelector(payload.currentGameMode);
        if (_lastModeCommand && payload.currentGameMode === _lastModeCommand) _lastModeCommand = null;
    }

    function onGameConfig(payload) {
        _gameConfig = payload;
        // Allow config to override the hint topic
        if (payload && typeof payload.hintTopic === 'string' && payload.hintTopic.trim()) {
            _hintTopic = payload.hintTopic.trim();
            document.dispatchEvent(new CustomEvent('pxd:hintTopicChanged', { detail: { hintTopic: _hintTopic } }));
        }
        populateGameSelector();
    }

    // ── HTML template ──────────────────────────────────────────────────────
    function buildHTML() {
        return '<section class="panel panel-control">' +
            '<div class="panel-header">' +
                '<h2 class="panel-title">Game Control</h2>' +
                '<div id="gameStatus" class="alert alert-info status-pill mb-0 text-center">Connecting...</div>' +
            '</div>' +
            '<div class="control-grid">' +
                '<div class="control-item">' +
                    '<label for="gameSelect" class="form-label">Mode</label>' +
                    '<select id="gameSelect" class="form-select" onchange="window._gcPanel.onGameChange()"><option value="">Loading\u2026</option></select>' +
                '</div>' +
                '<div class="control-item">' +
                    '<label class="form-label">Checklist</label>' +
                    '<button id="checklistBtn" type="button" class="btn btn-info w-100" onclick="window._gcPanel.openChecklist()">Open Checklist</button>' +
                '</div>' +
                '<div class="control-item control-item-action">' +
                    '<label class="form-label">Main Action</label>' +
                    '<button id="gameActionBtn" type="button" class="btn btn-primary w-100" onclick="window._gcPanel.sendGameAction()" disabled>Start</button>' +
                '</div>' +
                '<div class="control-item">' +
                    '<label class="form-label">End Game</label>' +
                    '<div class="btn-group w-100" role="group">' +
                        '<button id="solveBtn" type="button" class="btn btn-success" onclick="window._gcPanel.sendSolve()" disabled>Solve</button>' +
                        '<button id="failBtn"  type="button" class="btn btn-danger"  onclick="window._gcPanel.sendFail()"  disabled>Fail</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</section>';
    }

    function buildModalsHTML() {
        return '' +
        // Emergency modal
        '<div class="modal fade" id="gc-emergencyModal" tabindex="-1" aria-hidden="true">' +
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content">' +
                    '<div class="modal-header bg-danger text-white">' +
                        '<h5 class="modal-title">Emergency Controls</h5>' +
                        '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="row g-2">' +
                            _emergencyBtn('abortGame',        'emergency-btn-abort',              'Abort Current Game') +
                            _emergencyBtn('propsSleep',       'emergency-btn-sleep',              'Put Props to Sleep') +
                            _emergencyBtn('propsWake',        'emergency-btn-wake',               'Wake Props Up') +
                            _emergencyBtn('restartAdapters',  'emergency-btn-restart-adapters',   'Restart Props Adapters') +
                            _emergencyBtn('softwareRestart',  'emergency-btn-restart-software',   'Restart Software') +
                            _emergencyBtn('softwareShutdown', 'emergency-btn-shutdown-software',  'Shutdown Software') +
                            _emergencyBtn('machineReboot',    'emergency-btn-reboot-controller',  'Reboot Room Controller') +
                            _emergencyBtn('machineShutdown',  'emergency-btn-shutdown-controller','Shutdown Room Controller') +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button></div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        // Abort confirm modal
        '<div class="modal fade" id="gc-abortConfirmModal" tabindex="-1" aria-hidden="true">' +
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content">' +
                    '<div class="modal-header bg-danger text-white">' +
                        '<h5 class="modal-title">Confirm Abort</h5>' +
                        '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">Abort intro and run reset?</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="button" class="btn btn-danger" onclick="window._gcPanel.confirmIntroAbort()">Abort + Reset</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function _emergencyBtn(action, cssClass, label) {
        return '<div class="col-12"><button type="button" class="btn btn-lg w-100 ' + cssClass + '" ' +
            'onclick="window._gcPanel.emergencyAction(\'' + action + '\')">' + label + '</button></div>';
    }

    // ── panel.mount ────────────────────────────────────────────────────────
    function mount(slotEl) {
        var cfg = PxD.config;
        _config = cfg.gameControl || {};
        _topicRoot = cfg.topicRoot || '';
        _commandTopic = topic('commands', _config.commandTopic);
        _hintTopic = cfg.hints && cfg.hints.hintTopic ? cfg.hints.hintTopic : (_topicRoot + '/hints');

        _root = slotEl;
        slotEl.innerHTML = buildHTML();

        // Add emergency button to header
        var header = slotEl.querySelector('.panel-header');
        if (header) {
            var emerBtn = document.createElement('button');
            emerBtn.id = 'emergencyBtn';
            emerBtn.type = 'button';
            emerBtn.className = 'btn btn-danger';
            emerBtn.textContent = 'Emergency Controls';
            emerBtn.onclick = showEmergencyModal;
            header.appendChild(emerBtn);
        }

        // Inject modals into the page-level portal
        var portal = document.getElementById('pxd-modals');
        if (portal) portal.insertAdjacentHTML('beforeend', buildModalsHTML());

        // Expose methods for inline event handlers
        window._gcPanel = {
            onGameChange:       function () {
                var sel = _root.querySelector('#gameSelect');
                if (sel) applyGameSelection(sel.value, { sendCommand: true });
            },
            openChecklist:      openChecklist,
            sendGameAction:     sendGameAction,
            sendSolve:          function () { sendCommand('solve'); },
            sendFail:           function () { sendCommand('fail'); },
            emergencyAction:    emergencyAction,
            confirmIntroAbort:  confirmIntroAbort
        };

        // MQTT subscriptions
        var stateTopic      = topic('state',  _config.stateTopic);
        var configTopic     = topic('config', _config.configTopic);
        var checklistTopic  = _config.checklistStateTopic || (_topicRoot + '/checklist/state');

        PxD.mqtt.subscribe(stateTopic,     onGameState);
        PxD.mqtt.subscribe(configTopic,    onGameConfig);
        PxD.mqtt.subscribe(checklistTopic, handleChecklistState);

        // Heartbeat watchdog — updates status pill every 250ms
        _hbTimer = setInterval(function () {
            var connected = (Date.now() - _lastGameHeartbeat) < ((_config.heartbeatTimeoutMs) || 3000);
            if (!connected) {
                updateGameStatus('disconnected', '00:00');
                disableAllControls();
            }
        }, 250);

        // Request initial config
        PxD.mqtt.publish(_commandTopic, { command: 'getConfig' });
    }

    function unmount() {
        clearInterval(_hbTimer);
        window._gcPanel = null;
    }

    // Register with PxD
    PxD.panels.register('game-control', { mount: mount, unmount: unmount });
})();
