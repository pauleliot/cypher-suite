// Cypher Console : raccourci ⌥Espace (Option+Espace) dans Premiere Pro (macOS, JavaScript for Automation)
//
// Lancé (en arrière-plan) par Cypher : osascript -l JavaScript cypher-hotkey-mac.js
// Surveille les touches de tout le système et écrit « HOTKEY » sur la sortie standard quand ⌥Espace est pressé alors
// que Premiere est au premier plan ; Cypher ouvre alors la console. S'arrête quand Premiere n'est plus lancé.
// macOS ne transmet les touches qu'avec l'autorisation « Accessibilité » : sans elle, écrit « NOPERM », explique
// (une fois par jour) quelle case cocher, puis attend l'autorisation et démarre tout seul dès qu'elle est donnée.
// Journal : ~/Library/Logs/Cypher-raccourci.log
ObjC.import('Cocoa');
ObjC.import('ApplicationServices');

var KEY_SPACE = 49;
var OPTION = 1 << 19, COMMAND = 1 << 20, CONTROL = 1 << 18, SHIFT = 1 << 17;
var HOME = ObjC.unwrap($.NSHomeDirectory());
var LOG = HOME + '/Library/Logs/Cypher-raccourci.log';
var EXPLAINED = HOME + '/Library/Application Support/CypherSuite/hotkey-explained';
var SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';

function say(text) {
  var data = $(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding);
  $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
}

function log(text) {
  try {
    var line = new Date().toISOString() + '  ' + text + '\n';
    var fm = $.NSFileManager.defaultManager;
    if (!fm.fileExistsAtPath(LOG)) fm.createFileAtPathContentsAttributes(LOG, $.NSData.data, $());
    var h = $.NSFileHandle.fileHandleForWritingAtPath(LOG);
    if (h.isNil()) return;
    h.seekToEndOfFile;
    h.writeData($(line).dataUsingEncoding($.NSUTF8StringEncoding));
    h.closeFile;
  } catch (e) {}
}

function bundleOf(app) {
  try {
    return app ? ObjC.unwrap(app.bundleIdentifier) || '' : '';
  } catch (e) {
    return '';
  }
}

function premiereInFront() {
  return /^com\.adobe\.PremierePro/i.test(bundleOf($.NSWorkspace.sharedWorkspace.frontmostApplication));
}

function premiereRunning() {
  var apps = $.NSWorkspace.sharedWorkspace.runningApplications;
  for (var i = 0; i < apps.count; i++) if (/^com\.adobe\.PremierePro/i.test(bundleOf(apps.objectAtIndex(i)))) return true;
  return false;
}

// autorisation Accessibilité ; prompt : macOS ajoute aussi l'application à la liste des Réglages (case à cocher)
function trusted(prompt) {
  try {
    if (prompt) {
      var options = $.NSDictionary.dictionaryWithObjectForKey($.NSNumber.numberWithBool(true), $('AXTrustedCheckOptionPrompt'));
      return !!$.AXIsProcessTrustedWithOptions(options);
    }
    return !!$.AXIsProcessTrusted();
  } catch (e) {
    log('contrôle Accessibilité impossible : ' + e);
    return true; // on tente quand même
  }
}

// explication affichée au plus une fois par jour (le raccourci se relance à chaque démarrage de Premiere)
function explain() {
  try {
    var fm = $.NSFileManager.defaultManager;
    var attrs = fm.attributesOfItemAtPathError(EXPLAINED, $());
    if (!attrs.isNil() && Date.now() / 1000 - attrs.fileModificationDate.timeIntervalSince1970 < 86400) return;
  } catch (e) {}
  try {
    var sa = Application.currentApplication();
    sa.includeStandardAdditions = true;
    sa.doShellScript('mkdir -p "' + HOME + '/Library/Application Support/CypherSuite" && touch "' + EXPLAINED + '"');
    sa.activate();
    var r = sa.displayDialog(
      'Pour que ⌥Espace ouvre Cypher Console dans Premiere Pro, macOS doit l\'autoriser :\n\n' +
        'Réglages Système > Confidentialité et sécurité > Accessibilité : activez « Adobe Premiere Pro » ' +
        '(ou « osascript » s\'il apparaît dans la liste).\n\nLe raccourci marche dès que la case est cochée, sans redémarrer.',
      { withTitle: 'Cypher Console', buttons: ['Plus tard', 'Ouvrir les réglages'], defaultButton: 'Ouvrir les réglages', withIcon: 'note' }
    );
    if (r.buttonReturned === 'Ouvrir les réglages') sa.doShellScript('open "' + SETTINGS_URL + '"');
  } catch (e) {} // « Plus tard » ou fenêtre impossible
}

function listen() {
  $.NSEvent.addGlobalMonitorForEventsMatchingMaskHandler($.NSEventMaskKeyDown, function (event) {
    if (event.keyCode !== KEY_SPACE || event.isARepeat) return;
    var flags = event.modifierFlags;
    if (!(flags & OPTION) || flags & (COMMAND | CONTROL | SHIFT)) return;
    if (premiereInFront()) {
      say('HOTKEY');
      log('⌥Espace : console demandée');
    } else log('⌥Espace hors de Premiere (' + bundleOf($.NSWorkspace.sharedWorkspace.frontmostApplication) + ')');
  });
  log('surveillance de ⌥Espace active');
  say('READY');
}

function run() {
  var app = $.NSApplication.sharedApplication;
  log('démarrage (macOS ' + ObjC.unwrap($.NSProcessInfo.processInfo.operatingSystemVersionString) + ')');

  if (trusted(true)) {
    app.setActivationPolicy($.NSApplicationActivationPolicyProhibited); // pas d'icône dans le Dock
    listen();
  } else {
    say('NOPERM');
    log('autorisation Accessibilité manquante : en attente');
    explain();
    app.setActivationPolicy($.NSApplicationActivationPolicyProhibited);
    // l'autorisation peut être donnée pendant que Premiere tourne : on démarre dès qu'elle arrive
    var waiting = $.NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(2, true, function () {
      if (!trusted(false)) return;
      waiting.invalidate;
      log('autorisation Accessibilité accordée');
      listen();
    });
  }

  // Premiere quitté : on s'arrête (contrôle toutes les 5 s)
  $.NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(5, true, function () {
    if (!premiereRunning()) {
      log('Premiere fermé : arrêt');
      $.NSApplication.sharedApplication.terminate(null);
    }
  });

  app.run;
}
