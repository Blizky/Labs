const monthSelect = document.getElementById("month");
const yearInput = document.getElementById("year");
const generateButton = document.getElementById("generate");
const downloadButton = document.getElementById("download");
const filterToggle = document.getElementById("filter-toggle");
const filterPanel = document.getElementById("filter-panel");
const filterOfficial = document.getElementById("filter-official");
const filterObserved = document.getElementById("filter-observed");
const filterReligious = document.getElementById("filter-religious");
const filterOther = document.getElementById("filter-other");
const filterAstronomical = document.getElementById("filter-astronomical");
const calendarEl = document.getElementById("calendar");
const legendEl = document.getElementById("calendar-legend");

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const lookupYearMin = 2024;
const lookupYearMax = 2030;
let lastWarningYear = null;

const observedLookup = {
  2024: [{ name: "Lunar New Year", month: 1, day: 10 }],
  2025: [{ name: "Lunar New Year", month: 0, day: 29 }],
  2026: [{ name: "Lunar New Year", month: 1, day: 17 }],
  2027: [{ name: "Lunar New Year", month: 1, day: 6 }],
  2028: [{ name: "Lunar New Year", month: 0, day: 26 }],
  2029: [{ name: "Lunar New Year", month: 1, day: 13 }],
  2030: [{ name: "Lunar New Year", month: 1, day: 3 }],
};

const religiousLookup = {
  2024: [
    { name: "First Night of Ramadan", month: 2, day: 12 },
    { name: "Eid al-Fitr", month: 3, day: 10 },
    { name: "Eid al-Adha", month: 5, day: 17 },
    { name: "Passover (Eve)", month: 3, day: 22 },
    { name: "Rosh Hashanah", month: 9, day: 3 },
    { name: "Yom Kippur", month: 9, day: 12 },
    { name: "Orthodox Easter", month: 4, day: 5 },
    { name: "Diwali", month: 9, day: 31 },
  ],
  2025: [
    { name: "First Night of Ramadan", month: 2, day: 1 },
    { name: "Eid al-Fitr", month: 2, day: 30 },
    { name: "Eid al-Adha", month: 5, day: 6 },
    { name: "Passover (Eve)", month: 3, day: 12 },
    { name: "Rosh Hashanah", month: 8, day: 23 },
    { name: "Yom Kippur", month: 9, day: 2 },
    { name: "Orthodox Easter", month: 3, day: 20 },
    { name: "Diwali", month: 9, day: 20 },
  ],
  2026: [
    { name: "First Night of Ramadan", month: 1, day: 18 },
    { name: "Eid al-Fitr", month: 2, day: 20 },
    { name: "Eid al-Adha", month: 4, day: 27 },
    { name: "Passover (Eve)", month: 3, day: 1 },
    { name: "Rosh Hashanah", month: 8, day: 12 },
    { name: "Yom Kippur", month: 8, day: 21 },
    { name: "Orthodox Easter", month: 3, day: 12 },
    { name: "Diwali", month: 10, day: 8 },
  ],
  2027: [
    { name: "First Night of Ramadan", month: 1, day: 8 },
    { name: "Eid al-Fitr", month: 2, day: 10 },
    { name: "Eid al-Adha", month: 4, day: 17 },
    { name: "Passover (Eve)", month: 3, day: 21 },
    { name: "Rosh Hashanah", month: 9, day: 2 },
    { name: "Yom Kippur", month: 9, day: 11 },
    { name: "Orthodox Easter", month: 4, day: 2 },
    { name: "Diwali", month: 9, day: 28 },
  ],
  2028: [
    { name: "First Night of Ramadan", month: 0, day: 28 },
    { name: "Eid al-Fitr", month: 1, day: 27 },
    { name: "Eid al-Adha", month: 4, day: 5 },
    { name: "Passover (Eve)", month: 3, day: 10 },
    { name: "Rosh Hashanah", month: 8, day: 21 },
    { name: "Yom Kippur", month: 8, day: 30 },
    { name: "Orthodox Easter", month: 3, day: 16 },
    { name: "Diwali", month: 9, day: 17 },
  ],
  2029: [
    { name: "First Night of Ramadan", month: 0, day: 16 },
    { name: "Eid al-Fitr", month: 1, day: 15 },
    { name: "Eid al-Adha", month: 3, day: 24 },
    { name: "Passover (Eve)", month: 2, day: 30 },
    { name: "Rosh Hashanah", month: 8, day: 10 },
    { name: "Yom Kippur", month: 8, day: 19 },
    { name: "Orthodox Easter", month: 3, day: 8 },
    { name: "Diwali", month: 10, day: 5 },
  ],
  2030: [
    { name: "First Night of Ramadan", month: 0, day: 6 },
    { name: "Eid al-Fitr", month: 1, day: 5 },
    { name: "Eid al-Adha", month: 3, day: 14 },
    { name: "Passover (Eve)", month: 3, day: 17 },
    { name: "Rosh Hashanah", month: 8, day: 28 },
    { name: "Yom Kippur", month: 9, day: 7 },
    { name: "Orthodox Easter", month: 3, day: 28 },
    { name: "Diwali", month: 9, day: 25 },
  ],
};

function populateMonthSelect() {
  monthNames.forEach((name, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = name;
    monthSelect.appendChild(option);
  });
}

function setDefaults() {
  const today = new Date();
  yearInput.value = today.getFullYear();
  monthSelect.value = today.getMonth();
}

function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const first = new Date(year, monthIndex, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return new Date(year, monthIndex, day);
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const last = new Date(year, monthIndex + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, monthIndex, last.getDate() - offset);
}

function observedDate(date) {
  const day = date.getDay();
  if (day === 0) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  if (day === 6) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  }
  return date;
}

function formatKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addHoliday(map, date, name, type) {
  const key = formatKey(date);
  if (!map[key]) {
    map[key] = [];
  }
  map[key].push({ name, type });
}

function westernEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function newAndFullMoonDates(year, monthIndex) {
  const synodicMonth = 29.530588853;
  const reference = Date.UTC(2000, 0, 6, 18, 14);
  const monthStart = Date.UTC(year, monthIndex, 1);
  const monthEnd = Date.UTC(year, monthIndex + 1, 0, 23, 59);
  const phases = [];

  const kStart = Math.floor((monthStart - reference) / (synodicMonth * 24 * 60 * 60 * 1000)) - 1;
  const kEnd = kStart + 3;

  for (let k = kStart; k <= kEnd; k += 1) {
    const newMoon = reference + k * synodicMonth * 24 * 60 * 60 * 1000;
    const fullMoon = newMoon + synodicMonth / 2 * 24 * 60 * 60 * 1000;

    [ { name: "New Moon", time: newMoon }, { name: "Full Moon", time: fullMoon } ].forEach((phase) => {
      if (phase.time >= monthStart && phase.time <= monthEnd) {
        const date = new Date(phase.time);
        phases.push({ name: phase.name, date });
      }
    });
  }

  return phases;
}

function federalHolidays(year) {
  const holidays = {};
  const pushHoliday = (name, date) => {
    const observed = observedDate(date);
    addHoliday(holidays, observed, name, "official");
  };

  pushHoliday("New Year's Day", new Date(year, 0, 1));
  pushHoliday("Martin Luther King Jr. Day", nthWeekdayOfMonth(year, 0, 1, 3));
  pushHoliday("Washington's Birthday", nthWeekdayOfMonth(year, 1, 1, 3));
  pushHoliday("Memorial Day", lastWeekdayOfMonth(year, 4, 1));
  pushHoliday("Juneteenth", new Date(year, 5, 19));
  pushHoliday("Independence Day", new Date(year, 6, 4));
  pushHoliday("Labor Day", nthWeekdayOfMonth(year, 8, 1, 1));
  pushHoliday("Columbus Day", nthWeekdayOfMonth(year, 9, 1, 2));
  pushHoliday("Veterans Day", new Date(year, 10, 11));
  pushHoliday("Thanksgiving Day", nthWeekdayOfMonth(year, 10, 4, 4));
  pushHoliday("Christmas Day", new Date(year, 11, 25));

  return holidays;
}

function nonFederalObservances(year) {
  const observances = {};
  const pushObservance = (name, date) => {
    addHoliday(observances, date, name, "observed");
  };

  pushObservance("Valentine's Day", new Date(year, 1, 14));
  pushObservance("Groundhog Day", new Date(year, 1, 2));
  pushObservance("St. Patrick's Day", new Date(year, 2, 17));
  pushObservance("April Fools' Day", new Date(year, 3, 1));
  pushObservance("Earth Day", new Date(year, 3, 22));
  pushObservance("Tax Day", new Date(year, 3, 15));
  pushObservance("Cinco de Mayo", new Date(year, 4, 5));
  pushObservance("Mother's Day", nthWeekdayOfMonth(year, 4, 0, 2));
  pushObservance("Father's Day", nthWeekdayOfMonth(year, 5, 0, 3));
  pushObservance("Halloween", new Date(year, 9, 31));
  pushObservance("Christmas Eve", new Date(year, 11, 24));
  pushObservance("New Year's Eve", new Date(year, 11, 31));

  const lunarDates = observedLookup[year] || [];
  lunarDates.forEach((entry) => {
    pushObservance(entry.name, new Date(year, entry.month, entry.day));
  });

  return observances;
}

function religiousHolidays(year) {
  const holidays = {};
  const lookup = religiousLookup[year] || [];
  lookup.forEach((entry) => {
    addHoliday(holidays, new Date(year, entry.month, entry.day), entry.name, "religious");
  });

  const easterSunday = westernEaster(year);
  addHoliday(holidays, easterSunday, "Easter (Western)", "religious");
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(goodFriday.getDate() - 2);
  addHoliday(holidays, goodFriday, "Good Friday", "religious");

  return holidays;
}

function otherObservances(year) {
  const holidays = {};
  const dstStart = nthWeekdayOfMonth(year, 2, 0, 2);
  const dstEnd = nthWeekdayOfMonth(year, 10, 0, 1);
  addHoliday(holidays, dstStart, "Daylight Saving Time Starts", "other");
  addHoliday(holidays, dstEnd, "Daylight Saving Time Ends", "other");
  return holidays;
}

function astronomicalEvents(year, monthIndex) {
  const holidays = {};

  const seasonTable = {
    2024: [
      { name: "March Equinox", month: 2, day: 19 },
      { name: "June Solstice", month: 5, day: 20 },
      { name: "September Equinox", month: 8, day: 22 },
      { name: "December Solstice", month: 11, day: 21 },
    ],
    2025: [
      { name: "March Equinox", month: 2, day: 20 },
      { name: "June Solstice", month: 5, day: 20 },
      { name: "September Equinox", month: 8, day: 22 },
      { name: "December Solstice", month: 11, day: 21 },
    ],
    2026: [
      { name: "March Equinox", month: 2, day: 20 },
      { name: "June Solstice", month: 5, day: 21 },
      { name: "September Equinox", month: 8, day: 22 },
      { name: "December Solstice", month: 11, day: 21 },
    ],
    2027: [
      { name: "March Equinox", month: 2, day: 20 },
      { name: "June Solstice", month: 5, day: 21 },
      { name: "September Equinox", month: 8, day: 23 },
      { name: "December Solstice", month: 11, day: 21 },
    ],
    2028: [
      { name: "March Equinox", month: 2, day: 19 },
      { name: "June Solstice", month: 5, day: 20 },
      { name: "September Equinox", month: 8, day: 22 },
      { name: "December Solstice", month: 11, day: 21 },
    ],
    2029: [
      { name: "March Equinox", month: 2, day: 20 },
      { name: "June Solstice", month: 5, day: 21 },
      { name: "September Equinox", month: 8, day: 22 },
      { name: "December Solstice", month: 11, day: 21 },
    ],
    2030: [
      { name: "March Equinox", month: 2, day: 20 },
      { name: "June Solstice", month: 5, day: 21 },
      { name: "September Equinox", month: 8, day: 22 },
      { name: "December Solstice", month: 11, day: 21 },
    ],
  };

  const eclipseTable = {
    2024: [
      { name: "Penumbral Lunar Eclipse (US)", month: 2, day: 25 },
      { name: "Total Solar Eclipse (US)", month: 3, day: 8 },
      { name: "Partial Lunar Eclipse (US)", month: 8, day: 18 },
    ],
    2025: [
      { name: "Total Lunar Eclipse (US)", month: 2, day: 14 },
      { name: "Partial Solar Eclipse (US)", month: 2, day: 29 },
    ],
    2026: [
      { name: "Total Lunar Eclipse (US)", month: 2, day: 3 },
      { name: "Total Solar Eclipse (US)", month: 7, day: 12 },
      { name: "Partial Lunar Eclipse (US)", month: 7, day: 28 },
    ],
    2027: [
      { name: "Penumbral Lunar Eclipse (US)", month: 1, day: 20 },
      { name: "Total Solar Eclipse (US)", month: 7, day: 2 },
      { name: "Penumbral Lunar Eclipse (US)", month: 7, day: 17 },
    ],
    2028: [
      { name: "Partial Lunar Eclipse (US)", month: 0, day: 11 },
      { name: "Annular Solar Eclipse (US)", month: 0, day: 26 },
      { name: "Total Lunar Eclipse (US)", month: 11, day: 31 },
    ],
    2029: [
      { name: "Partial Solar Eclipse (US)", month: 0, day: 14 },
      { name: "Partial Solar Eclipse (US)", month: 5, day: 12 },
      { name: "Total Lunar Eclipse (US)", month: 5, day: 25 },
      { name: "Total Lunar Eclipse (US)", month: 11, day: 20 },
    ],
    2030: [
      { name: "Annular Solar Eclipse (US)", month: 5, day: 1 },
      { name: "Penumbral Lunar Eclipse (US)", month: 11, day: 9 },
    ],
  };

  (seasonTable[year] || []).forEach((entry) => {
    if (entry.month === monthIndex) {
      addHoliday(holidays, new Date(year, entry.month, entry.day), entry.name, "astronomical");
    }
  });

  if (monthIndex === 7) {
    addHoliday(holidays, new Date(year, 7, 12), "Perseids Peak", "astronomical");
  }
  if (monthIndex === 11) {
    addHoliday(holidays, new Date(year, 11, 13), "Geminids Peak", "astronomical");
  }

  (eclipseTable[year] || []).forEach((entry) => {
    if (entry.month === monthIndex) {
      addHoliday(holidays, new Date(year, entry.month, entry.day), entry.name, "astronomical");
    }
  });

  newAndFullMoonDates(year, monthIndex).forEach((phase) => {
    addHoliday(holidays, phase.date, phase.name, "astronomical");
  });

  return holidays;
}

function buildHolidayMap(year) {
  const holidays = {};
  [federalHolidays(year), nonFederalObservances(year), religiousHolidays(year), otherObservances(year)].forEach((group) => {
    Object.keys(group).forEach((key) => {
      if (!holidays[key]) {
        holidays[key] = [];
      }
      holidays[key].push(...group[key]);
    });
  });
  return holidays;
}

function filterState() {
  return {
    official: filterOfficial ? filterOfficial.checked : true,
    observed: filterObserved ? filterObserved.checked : true,
    religious: filterReligious ? filterReligious.checked : true,
    other: filterOther ? filterOther.checked : true,
    astronomical: filterAstronomical ? filterAstronomical.checked : true,
  };
}

function buildCalendar(year, monthIndex, title, holidays, filters) {
  calendarEl.innerHTML = "";

  const table = document.createElement("table");
  table.className = "calendar-table";

  const caption = document.createElement("caption");
  caption.className = "calendar-title";
  caption.textContent = title;
  table.appendChild(caption);

  const headerRow = document.createElement("tr");
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((day) => {
    const th = document.createElement("th");
    th.textContent = day;
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  const firstDay = new Date(year, monthIndex, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  let currentDay = 1 - startDay;
  for (let week = 0; week < 5; week += 1) {
    const row = document.createElement("tr");
    for (let day = 0; day < 7; day += 1) {
      const cell = document.createElement("td");
      if (currentDay > 0 && currentDay <= daysInMonth) {
        const date = new Date(year, monthIndex, currentDay);
        const key = formatKey(date);
        cell.classList.add("day");

        const number = document.createElement("div");
        number.className = "day-number";
        number.textContent = currentDay;

        const dayHolidays = holidays[key] || [];
        dayHolidays
          .filter((item) => filters[item.type])
          .forEach((holiday) => {
            const note = document.createElement("div");
            note.className = "holiday";
            const icon = document.createElement("span");
            if (holiday.type === "astronomical" && holiday.name.includes("Moon")) {
              icon.className = "holiday-icon moon";
            } else {
              icon.className = `holiday-icon ${holiday.type}`;
            }

            const label = document.createElement("span");
            label.className = "holiday-text";
            label.textContent = holiday.name;

            note.appendChild(icon);
            note.appendChild(label);
            cell.appendChild(note);
          });

        cell.appendChild(number);
      } else {
        cell.classList.add("empty");
      }

      row.appendChild(cell);
      currentDay += 1;
    }
    table.appendChild(row);
  }

  calendarEl.appendChild(table);
}


function updatePlanner() {
  const year = Number(yearInput.value);
  const monthIndex = Number(monthSelect.value);
  const title = `${monthNames[monthIndex]} ${year}`;
  if ((year < lookupYearMin || year > lookupYearMax) && lastWarningYear !== year) {
    alert(`Some observance dates are only available for ${lookupYearMin}–${lookupYearMax}. Outside that range, some events may be missing.`);
    lastWarningYear = year;
  }
  const filters = filterState();
  const holidays = buildHolidayMap(year);
  const astro = astronomicalEvents(year, monthIndex);
  Object.keys(astro).forEach((key) => {
    if (!holidays[key]) {
      holidays[key] = [];
    }
    holidays[key].push(...astro[key]);
  });

  buildCalendar(year, monthIndex, title, holidays, filters);
  updateLegend(holidays, year, monthIndex, filters);
}

populateMonthSelect();
setDefaults();
updatePlanner();

function updateLegend(holidays, year, monthIndex, filters) {
  if (!legendEl) {
    return;
  }

  const order = [
    { type: "official", label: "Official" },
    { type: "observed", label: "Observed" },
    { type: "religious", label: "Religious" },
    { type: "other", label: "Other" },
    { type: "astronomical", label: "Astronomical" },
  ];

  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
  const present = new Set();

  Object.keys(holidays).forEach((key) => {
    if (!key.startsWith(monthKey)) {
      return;
    }
    holidays[key].forEach((item) => {
      if (filters[item.type]) {
        present.add(item.type);
      }
    });
  });

  legendEl.innerHTML = "";
  order.forEach((entry) => {
    if (!present.has(entry.type)) {
      return;
    }
    const item = document.createElement("span");
    item.className = "legend-item";

    const icon = document.createElement("span");
    icon.className = `holiday-icon ${entry.type}`;

    const label = document.createElement("span");
    label.textContent = entry.label;

    item.appendChild(icon);
    item.appendChild(label);
    legendEl.appendChild(item);
  });
}

if (filterToggle && filterPanel) {
  let closeTimer = null;

  const openPanel = () => {
    filterPanel.classList.add("is-open");
    filterToggle.setAttribute("aria-expanded", "true");
    filterPanel.setAttribute("aria-hidden", "false");
  };

  const closePanel = () => {
    filterPanel.classList.remove("is-open");
    filterToggle.setAttribute("aria-expanded", "false");
    filterPanel.setAttribute("aria-hidden", "true");
  };

  const scheduleClose = () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(closePanel, 300);
  };

  const cancelClose = () => {
    clearTimeout(closeTimer);
  };

  filterToggle.addEventListener("click", () => {
    cancelClose();
    if (filterPanel.classList.contains("is-open")) {
      closePanel();
    } else {
      openPanel();
    }
  });

  filterPanel.addEventListener("mouseenter", cancelClose);
  filterPanel.addEventListener("mouseleave", scheduleClose);
  filterToggle.addEventListener("mouseenter", cancelClose);
  filterToggle.addEventListener("mouseleave", scheduleClose);
}

[filterOfficial, filterObserved, filterReligious, filterOther, filterAstronomical].forEach((checkbox) => {
  if (checkbox) {
    checkbox.addEventListener("change", updatePlanner);
  }
});

async function downloadPdf() {
  const planner = document.getElementById("planner-print");
  if (!planner || !window.html2canvas || !window.jspdf) {
    alert("PDF libraries failed to load. Please refresh the page and try again.");
    return;
  }

  const title = `${monthNames[Number(monthSelect.value)]}-${yearInput.value}`;
  const canvas = await window.html2canvas(planner, {
    scale: 2,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
  const renderWidth = imgWidth * scale;
  const renderHeight = imgHeight * scale;
  const x = (pageWidth - renderWidth) / 2;
  const y = (pageHeight - renderHeight) / 2;

  pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);
  pdf.save(`${title}.pdf`);
}

generateButton.addEventListener("click", updatePlanner);
if (downloadButton) {
  downloadButton.addEventListener("click", downloadPdf);
}
