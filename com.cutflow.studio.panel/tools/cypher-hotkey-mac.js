// Cypher Console : raccourci ⌥Espace (Option+Espace) dans Premiere Pro (macOS, JavaScript for Automation)
//
// Lancé (en arrière-plan) par Cypher : osascript -l JavaScript cypher-hotkey-mac.js
// Surveille les touches de tout le système (macOS demande une fois l'autorisation « Accessibilité ») et écrit
// « HOTKEY » sur la sortie standard quand ⌥Espace est pressé alors que Premiere est au premier plan ; Cypher ouvre
// alors la console. S'arrête quand Premiere n'est plus lancé. Écrit « NOPERM » si l'autorisation manque.
ObjC.import('Cocoa');
ObjC.import('ApplicationServices');

var KEY_SPACE = 49;
var OPTION = 1 << 19, COMMAND = 1 << 20, CONTROL = 1 << 18, SHIFT = 1 << 17;

function say(text) {
  var data = $(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding);
  $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
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

function run() {
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyProhibited); // pas d'icône dans le Dock

  // autorisation Accessibilité : sans elle, macOS ne transmet pas les touches (demande affichée une fois)
  try {
    var options = $.NSDictionary.dictionaryWithObjectForKey(true, 'AXTrustedCheckOptionPrompt');
    if (!$.AXIsProcessTrustedWithOptions(options)) say('NOPERM');
  } catch (e) {}

  $.NSEvent.addGlobalMonitorForEventsMatchingMaskHandler($.NSEventMaskKeyDown, function (event) {
    if (event.keyCode !== KEY_SPACE || event.isARepeat) return;
    var flags = event.modifierFlags;
    if ((flags & OPTION) && !(flags & (COMMAND | CONTROL | SHIFT)) && premiereInFront()) say('HOTKEY');
  });

  // Premiere quitté : on s'arrête (contrôle toutes les 5 s)
  $.NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(5, true, function () {
    if (!premiereRunning()) $.NSApplication.sharedApplication.terminate(null);
  });

  say('READY');
  app.run;
}
