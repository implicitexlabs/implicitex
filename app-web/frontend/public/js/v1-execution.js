(function () {
  'use strict';

  var storageKey = 'implicitex:v1-execution:rev6';
  var checkboxes = Array.prototype.slice.call(
    document.querySelectorAll('[data-check]')
  );
  var progress = document.getElementById('checklistProgress');
  var reset = document.getElementById('resetChecklist');
  var printButton = document.getElementById('printDocument');
  var isPdfRender = new URLSearchParams(window.location.search).has('pdf');

  function readSavedState() {
    if (isPdfRender) return {};
    try {
      var value = localStorage.getItem(storageKey);
      return value ? JSON.parse(value) : {};
    } catch (error) {
      return {};
    }
  }

  function writeSavedState() {
    if (isPdfRender) return;
    var state = {};
    checkboxes.forEach(function (checkbox) {
      state[checkbox.dataset.check] = checkbox.checked;
    });
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      // Local progress is optional. The document remains usable without storage.
    }
  }

  function updateProgress() {
    if (!progress) return;
    var completed = checkboxes.filter(function (checkbox) {
      return checkbox.checked;
    }).length;
    progress.textContent = completed + ' of ' + checkboxes.length + ' complete';
  }

  var saved = readSavedState();
  checkboxes.forEach(function (checkbox) {
    checkbox.checked = saved[checkbox.dataset.check] === true;
    checkbox.addEventListener('change', function () {
      writeSavedState();
      updateProgress();
    });
  });

  if (reset) {
    reset.addEventListener('click', function () {
      if (!window.confirm('Reset all locally saved V1 checklist progress?')) {
        return;
      }
      checkboxes.forEach(function (checkbox) {
        checkbox.checked = false;
      });
      try {
        localStorage.removeItem(storageKey);
      } catch (error) {
        // The visual reset still succeeds if storage is unavailable.
      }
      updateProgress();
    });
  }

  if (printButton) {
    printButton.addEventListener('click', function () {
      window.print();
    });
  }

  updateProgress();
}());
