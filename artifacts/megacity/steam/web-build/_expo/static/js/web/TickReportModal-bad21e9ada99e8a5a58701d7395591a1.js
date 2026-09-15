__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function () {
      return TickReportModal;
    }
  });
  var _reactCompilerRuntime = require(_dependencyMap[0]);
  var _expoVectorIcons = require(_dependencyMap[1]);
  require(_dependencyMap[2]);
  var _reactNativeWebDistExportsModal = require(_dependencyMap[3]);
  var Modal = _interopDefault(_reactNativeWebDistExportsModal);
  require(_dependencyMap[4]);
  var _reactNativeWebDistExportsPressable = require(_dependencyMap[5]);
  var Pressable = _interopDefault(_reactNativeWebDistExportsPressable);
  var _reactNativeWebDistExportsScrollView = require(_dependencyMap[6]);
  var ScrollView = _interopDefault(_reactNativeWebDistExportsScrollView);
  var _reactNativeWebDistExportsStyleSheet = require(_dependencyMap[7]);
  var StyleSheet = _interopDefault(_reactNativeWebDistExportsStyleSheet);
  var _reactNativeWebDistExportsText = require(_dependencyMap[8]);
  var Text = _interopDefault(_reactNativeWebDistExportsText);
  var _reactNativeWebDistExportsView = require(_dependencyMap[9]);
  var View = _interopDefault(_reactNativeWebDistExportsView);
  var _reactNativeSafeAreaContext = require(_dependencyMap[10]);
  var _contextThemeContext = require(_dependencyMap[11]);
  var _hooksUseThemedStyles = require(_dependencyMap[12]);
  var _engineFormulas = require(_dependencyMap[13]);
  var _utilsFormat = require(_dependencyMap[14]);
  var _reactJsxRuntime = require(_dependencyMap[15]);
  const DEPTH_LABEL = {
    lite: "Lite",
    standard: "Standard",
    deep: "Deep"
  };
  const getCategoryRules = Colors => [{
    title: "RESOURCES",
    icon: "package",
    color: Colors.accent,
    match: ["Credits", "Tax", "Trade", "Tourism", "Upkeep", "Steel", "Fuel", "Goods", "Med", "Food", "Water", "Power"]
  }, {
    title: "CITY STATUS",
    icon: "activity",
    color: Colors.warning,
    match: ["Unrest", "Happiness", "Morale", "Crime", "Education", "Health", "Population", "Employment", "Housing", "Biosphere", "Disease"]
  }, {
    title: "MILITARY & SECURITY",
    icon: "shield",
    color: "#ff4444",
    match: ["Combat", "Raid", "Defense", "Military", "Engagement", "Zone", "Skirmish", "Breach", "Detection"]
  }, {
    title: "RESEARCH & TECH",
    icon: "cpu",
    color: "#8888ff",
    match: ["Research", "Tech", "Unlocked"]
  }, {
    title: "INFRASTRUCTURE",
    icon: "tool",
    color: "#aaaaaa",
    match: ["Waste", "Transit", "Sanitation", "Comms", "Infrastructure"]
  }];
  function categorizeEntries(entries, Colors) {
    const used = new Set();
    const categories = [];
    for (const rule of getCategoryRules(Colors)) {
      const matched = [];
      entries.forEach((e, i) => {
        if (used.has(i)) return;
        if (rule.match.some(m => e.label.includes(m) || e.reason.includes(m))) {
          matched.push(e);
          used.add(i);
        }
      });
      if (matched.length > 0) {
        categories.push({
          title: rule.title,
          icon: rule.icon,
          color: rule.color,
          entries: matched
        });
      }
    }
    const remaining = entries.filter((_, i) => !used.has(i));
    if (remaining.length > 0) {
      categories.push({
        title: "OTHER",
        icon: "list",
        color: Colors.textMuted,
        entries: remaining
      });
    }
    return categories;
  }
  function SummaryBar(t0) {
    const $ = (0, _reactCompilerRuntime.c)(24);
    const {
      entries
    } = t0;
    const {
      colors: Colors
    } = (0, _contextThemeContext.useTheme)();
    const styles = useStyles();
    let t1;
    if ($[0] !== entries) {
      t1 = entries.filter(_temp);
      $[0] = entries;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    const positive = t1.length;
    let t2;
    if ($[2] !== entries) {
      t2 = entries.filter(_temp2);
      $[2] = entries;
      $[3] = t2;
    } else {
      t2 = $[3];
    }
    const negative = t2.length;
    const neutral = entries.length - positive - negative;
    let t3;
    if ($[4] !== Colors || $[5] !== positive || $[6] !== styles.summaryItem || $[7] !== styles.summaryText) {
      t3 = positive > 0 && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.summaryItem,
        children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
          name: "trending-up",
          size: 12,
          color: Colors.accent
        }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: [styles.summaryText, {
            color: Colors.accent
          }],
          children: positive
        })]
      });
      $[4] = Colors;
      $[5] = positive;
      $[6] = styles.summaryItem;
      $[7] = styles.summaryText;
      $[8] = t3;
    } else {
      t3 = $[8];
    }
    let t4;
    if ($[9] !== Colors || $[10] !== negative || $[11] !== styles.summaryItem || $[12] !== styles.summaryText) {
      t4 = negative > 0 && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.summaryItem,
        children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
          name: "trending-down",
          size: 12,
          color: Colors.danger
        }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: [styles.summaryText, {
            color: Colors.danger
          }],
          children: negative
        })]
      });
      $[9] = Colors;
      $[10] = negative;
      $[11] = styles.summaryItem;
      $[12] = styles.summaryText;
      $[13] = t4;
    } else {
      t4 = $[13];
    }
    let t5;
    if ($[14] !== Colors || $[15] !== neutral || $[16] !== styles.summaryItem || $[17] !== styles.summaryText) {
      t5 = neutral > 0 && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.summaryItem,
        children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
          name: "minus",
          size: 12,
          color: Colors.textMuted
        }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: [styles.summaryText, {
            color: Colors.textMuted
          }],
          children: neutral
        })]
      });
      $[14] = Colors;
      $[15] = neutral;
      $[16] = styles.summaryItem;
      $[17] = styles.summaryText;
      $[18] = t5;
    } else {
      t5 = $[18];
    }
    let t6;
    if ($[19] !== styles.summaryBar || $[20] !== t3 || $[21] !== t4 || $[22] !== t5) {
      t6 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.summaryBar,
        children: [t3, t4, t5]
      });
      $[19] = styles.summaryBar;
      $[20] = t3;
      $[21] = t4;
      $[22] = t5;
      $[23] = t6;
    } else {
      t6 = $[23];
    }
    return t6;
  }
  function _temp2(e_0) {
    return e_0.severity === "negative";
  }
  function _temp(e) {
    return e.severity === "positive";
  }
  function EntryRow(t0) {
    const $ = (0, _reactCompilerRuntime.c)(24);
    const {
      entry
    } = t0;
    const {
      colors: Colors
    } = (0, _contextThemeContext.useTheme)();
    const styles = useStyles();
    const deltaColor = entry.severity === "positive" ? Colors.accent : entry.severity === "negative" ? Colors.danger : entry.severity === "warning" ? Colors.warning : Colors.info;
    const prefix = entry.delta > 0 ? "+" : "";
    let t1;
    if ($[0] !== entry.label || $[1] !== styles.entryLabel) {
      t1 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: styles.entryLabel,
        children: entry.label
      });
      $[0] = entry.label;
      $[1] = styles.entryLabel;
      $[2] = t1;
    } else {
      t1 = $[2];
    }
    let t2;
    if ($[3] !== entry.reason || $[4] !== styles.entryReason) {
      t2 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: styles.entryReason,
        children: entry.reason
      });
      $[3] = entry.reason;
      $[4] = styles.entryReason;
      $[5] = t2;
    } else {
      t2 = $[5];
    }
    let t3;
    if ($[6] !== styles.entryLeft || $[7] !== t1 || $[8] !== t2) {
      t3 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.entryLeft,
        children: [t1, t2]
      });
      $[6] = styles.entryLeft;
      $[7] = t1;
      $[8] = t2;
      $[9] = t3;
    } else {
      t3 = $[9];
    }
    let t4;
    if ($[10] !== deltaColor) {
      t4 = {
        color: deltaColor
      };
      $[10] = deltaColor;
      $[11] = t4;
    } else {
      t4 = $[11];
    }
    let t5;
    if ($[12] !== styles.entryDelta || $[13] !== t4) {
      t5 = [styles.entryDelta, t4];
      $[12] = styles.entryDelta;
      $[13] = t4;
      $[14] = t5;
    } else {
      t5 = $[14];
    }
    let t6;
    if ($[15] !== entry.delta || $[16] !== entry.unit || $[17] !== prefix || $[18] !== t5) {
      t6 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Text.default, {
        style: t5,
        children: [prefix, entry.delta, " ", entry.unit]
      });
      $[15] = entry.delta;
      $[16] = entry.unit;
      $[17] = prefix;
      $[18] = t5;
      $[19] = t6;
    } else {
      t6 = $[19];
    }
    let t7;
    if ($[20] !== styles.entryRow || $[21] !== t3 || $[22] !== t6) {
      t7 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.entryRow,
        children: [t3, t6]
      });
      $[20] = styles.entryRow;
      $[21] = t3;
      $[22] = t6;
      $[23] = t7;
    } else {
      t7 = $[23];
    }
    return t7;
  }
  function CategorySection(t0) {
    const $ = (0, _reactCompilerRuntime.c)(27);
    const {
      category
    } = t0;
    const styles = useStyles();
    const t1 = styles.categorySection;
    let t2;
    if ($[0] !== category.color || $[1] !== category.icon) {
      t2 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
        name: category.icon,
        size: 13,
        color: category.color
      });
      $[0] = category.color;
      $[1] = category.icon;
      $[2] = t2;
    } else {
      t2 = $[2];
    }
    let t3;
    if ($[3] !== category.color) {
      t3 = {
        color: category.color
      };
      $[3] = category.color;
      $[4] = t3;
    } else {
      t3 = $[4];
    }
    let t4;
    if ($[5] !== styles.categoryTitle || $[6] !== t3) {
      t4 = [styles.categoryTitle, t3];
      $[5] = styles.categoryTitle;
      $[6] = t3;
      $[7] = t4;
    } else {
      t4 = $[7];
    }
    let t5;
    if ($[8] !== category.title || $[9] !== t4) {
      t5 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: t4,
        children: category.title
      });
      $[8] = category.title;
      $[9] = t4;
      $[10] = t5;
    } else {
      t5 = $[10];
    }
    let t6;
    if ($[11] !== category.color) {
      t6 = {
        backgroundColor: category.color
      };
      $[11] = category.color;
      $[12] = t6;
    } else {
      t6 = $[12];
    }
    let t7;
    if ($[13] !== styles.categoryLine || $[14] !== t6) {
      t7 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(View.default, {
        style: [styles.categoryLine, t6]
      });
      $[13] = styles.categoryLine;
      $[14] = t6;
      $[15] = t7;
    } else {
      t7 = $[15];
    }
    let t8;
    if ($[16] !== styles.categoryHeader || $[17] !== t2 || $[18] !== t5 || $[19] !== t7) {
      t8 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.categoryHeader,
        children: [t2, t5, t7]
      });
      $[16] = styles.categoryHeader;
      $[17] = t2;
      $[18] = t5;
      $[19] = t7;
      $[20] = t8;
    } else {
      t8 = $[20];
    }
    let t9;
    if ($[21] !== category.entries) {
      t9 = category.entries.map(_temp3);
      $[21] = category.entries;
      $[22] = t9;
    } else {
      t9 = $[22];
    }
    let t10;
    if ($[23] !== styles.categorySection || $[24] !== t8 || $[25] !== t9) {
      t10 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: t1,
        children: [t8, t9]
      });
      $[23] = styles.categorySection;
      $[24] = t8;
      $[25] = t9;
      $[26] = t10;
    } else {
      t10 = $[26];
    }
    return t10;
  }

  // The next-lower OFFLINE SIM DEPTH notch, or null when already at the
  // floor ("lite"). Drives both the auto-tune button label and whether the
  // button shows at all.
  function _temp3(e, i) {
    return /*#__PURE__*/(0, _reactJsxRuntime.jsx)(EntryRow, {
      entry: e
    }, i);
  }
  const NEXT_LOWER_DEPTH = {
    deep: "standard",
    standard: "lite",
    lite: null
  };
  function TickReportModal(t0) {
    const $ = (0, _reactCompilerRuntime.c)(204);
    const {
      visible,
      entries,
      tickCount,
      onDismiss,
      simulatedTicks,
      extrapolatedTicks,
      offlineSimDepth,
      catchupWallMs,
      estimatedWallMs,
      recentOvershootCount,
      onAutoTuneDepth,
      subsystemErrors,
      onCopyReport
    } = t0;
    const {
      colors: Colors
    } = (0, _contextThemeContext.useTheme)();
    const styles = useStyles();
    const insets = (0, _reactNativeSafeAreaContext.useSafeAreaInsets)();
    let T0;
    let T1;
    let T2;
    let T3;
    let t1;
    let t10;
    let t11;
    let t12;
    let t13;
    let t14;
    let t15;
    let t16;
    let t17;
    let t18;
    let t2;
    let t3;
    let t4;
    let t5;
    let t6;
    let t7;
    let t8;
    let t9;
    if ($[0] !== Colors || $[1] !== catchupWallMs || $[2] !== entries || $[3] !== estimatedWallMs || $[4] !== extrapolatedTicks || $[5] !== insets.bottom || $[6] !== offlineSimDepth || $[7] !== onAutoTuneDepth || $[8] !== onCopyReport || $[9] !== onDismiss || $[10] !== recentOvershootCount || $[11] !== simulatedTicks || $[12] !== styles.autoTuneBtn || $[13] !== styles.autoTuneText || $[14] !== styles.catchupNote || $[15] !== styles.catchupText || $[16] !== styles.closeBtn || $[17] !== styles.copyReportBtn || $[18] !== styles.copyReportText || $[19] !== styles.depthHint || $[20] !== styles.depthNote || $[21] !== styles.depthText || $[22] !== styles.extrapolationNote || $[23] !== styles.extrapolationText || $[24] !== styles.header || $[25] !== styles.overlay || $[26] !== styles.overshootHint || $[27] !== styles.overshootNote || $[28] !== styles.overshootText || $[29] !== styles.panel || $[30] !== styles.scanline || $[31] !== styles.scroll || $[32] !== styles.subsystemHeader || $[33] !== styles.subsystemHeaderText || $[34] !== styles.subsystemHint || $[35] !== styles.subsystemMsg || $[36] !== styles.subsystemName || $[37] !== styles.subsystemNote || $[38] !== styles.subsystemOverflow || $[39] !== styles.subsystemRow || $[40] !== styles.subtitle || $[41] !== styles.title || $[42] !== subsystemErrors || $[43] !== tickCount || $[44] !== visible) {
      const categories = categorizeEntries(entries, Colors);
      const hoursAway = Math.round(tickCount * 0.25);
      let t19;
      if ($[67] !== catchupWallMs || $[68] !== tickCount) {
        t19 = (0, _utilsFormat.shouldShowCatchupPill)(catchupWallMs, tickCount);
        $[67] = catchupWallMs;
        $[68] = tickCount;
        $[69] = t19;
      } else {
        t19 = $[69];
      }
      const showCatchupDuration = t19;
      let t20;
      if ($[70] !== catchupWallMs || $[71] !== showCatchupDuration) {
        t20 = showCatchupDuration ? (0, _utilsFormat.formatCatchupDuration)(catchupWallMs) : "";
        $[70] = catchupWallMs;
        $[71] = showCatchupDuration;
        $[72] = t20;
      } else {
        t20 = $[72];
      }
      const catchupDurationLabel = t20;
      let t21;
      if ($[73] !== catchupWallMs || $[74] !== estimatedWallMs || $[75] !== showCatchupDuration) {
        t21 = showCatchupDuration && (0, _utilsFormat.isResumeOvershoot)(catchupWallMs, estimatedWallMs);
        $[73] = catchupWallMs;
        $[74] = estimatedWallMs;
        $[75] = showCatchupDuration;
        $[76] = t21;
      } else {
        t21 = $[76];
      }
      const showOvershootWarning = t21;
      let t22;
      if ($[77] !== estimatedWallMs || $[78] !== showOvershootWarning) {
        t22 = showOvershootWarning ? (0, _utilsFormat.formatCatchupDuration)(estimatedWallMs) : "";
        $[77] = estimatedWallMs;
        $[78] = showOvershootWarning;
        $[79] = t22;
      } else {
        t22 = $[79];
      }
      const overshootEstimateLabel = t22;
      const t23 = recentOvershootCount ?? (showOvershootWarning ? 1 : 0);
      let t24;
      if ($[80] !== t23) {
        t24 = (0, _utilsFormat.getOvershootEscalation)(t23);
        $[80] = t23;
        $[81] = t24;
      } else {
        t24 = $[81];
      }
      const overshootEscalation = t24;
      const overshootHeadline = showOvershootWarning ? overshootEscalation === "severe" ? `RESUME PERFORMANCE DEGRADING (${recentOvershootCount}× RECENT) — ESTIMATED ${overshootEstimateLabel}` : overshootEscalation === "moderate" ? `TOOK LONGER THAN EXPECTED (${recentOvershootCount}× RECENT) — ESTIMATED ${overshootEstimateLabel}` : `TOOK LONGER THAN EXPECTED — ESTIMATED ${overshootEstimateLabel}` : "";
      const overshootHint = showOvershootWarning ? overshootEscalation === "severe" ? "Strongly consider lowering OFFLINE SIM DEPTH in Settings \u2014 recent resumes have repeatedly run over budget on this device." : "If this keeps happening, lower OFFLINE SIM DEPTH in Settings to shorten future resumes." : "";
      const autoTuneTarget = offlineSimDepth ? NEXT_LOWER_DEPTH[offlineSimDepth] : null;
      const canAutoTune = showOvershootWarning && overshootEscalation === "severe" && !!onAutoTuneDepth && autoTuneTarget !== null;
      let t25;
      if ($[82] !== autoTuneTarget) {
        t25 = autoTuneTarget ? `AUTO-TUNE: LOWER TO ${DEPTH_LABEL[autoTuneTarget].toUpperCase()}` : "";
        $[82] = autoTuneTarget;
        $[83] = t25;
      } else {
        t25 = $[83];
      }
      const autoTuneLabel = t25;
      let t26;
      if ($[84] !== showCatchupDuration || $[85] !== tickCount) {
        t26 = showCatchupDuration ? (0, _utilsFormat.formatResumedAmount)(tickCount) : "";
        $[84] = showCatchupDuration;
        $[85] = tickCount;
        $[86] = t26;
      } else {
        t26 = $[86];
      }
      const resumedAmountLabel = t26;
      const showExtrapolationNote = typeof extrapolatedTicks === "number" && extrapolatedTicks > 0 && typeof simulatedTicks === "number";
      const showDepthNote = showExtrapolationNote && !!offlineSimDepth;
      const depthLabel = offlineSimDepth ? DEPTH_LABEL[offlineSimDepth] : "";
      const depthHint = offlineSimDepth === "deep" ? null : offlineSimDepth === "standard" ? "Switch to Deep in Settings to simulate more on resume." : "Switch to Standard or Deep in Settings to simulate more on resume.";
      T3 = Modal.default;
      t15 = visible;
      t16 = "slide";
      t17 = true;
      t18 = onDismiss;
      T2 = View.default;
      t14 = styles.overlay;
      T1 = View.default;
      const t27 = insets.bottom + 16;
      let t28;
      if ($[87] !== t27) {
        t28 = {
          paddingBottom: t27
        };
        $[87] = t27;
        $[88] = t28;
      } else {
        t28 = $[88];
      }
      if ($[89] !== styles.panel || $[90] !== t28) {
        t5 = [styles.panel, t28];
        $[89] = styles.panel;
        $[90] = t28;
        $[91] = t5;
      } else {
        t5 = $[91];
      }
      let t29;
      if ($[92] !== styles.title) {
        t29 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: styles.title,
          children: "SECTOR REPORT"
        });
        $[92] = styles.title;
        $[93] = t29;
      } else {
        t29 = $[93];
      }
      const t30 = tickCount !== 1 ? "S" : "";
      const t31 = hoursAway > 0 ? ` • ~${hoursAway}H ELAPSED` : "";
      let t32;
      if ($[94] !== styles.subtitle || $[95] !== t30 || $[96] !== t31 || $[97] !== tickCount) {
        t32 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Text.default, {
          style: styles.subtitle,
          children: [tickCount, " TICK", t30, " PROCESSED", t31]
        });
        $[94] = styles.subtitle;
        $[95] = t30;
        $[96] = t31;
        $[97] = tickCount;
        $[98] = t32;
      } else {
        t32 = $[98];
      }
      let t33;
      if ($[99] !== t29 || $[100] !== t32) {
        t33 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          children: [t29, t32]
        });
        $[99] = t29;
        $[100] = t32;
        $[101] = t33;
      } else {
        t33 = $[101];
      }
      let t34;
      if ($[102] !== Colors.textSecondary) {
        t34 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
          name: "x",
          size: 20,
          color: Colors.textSecondary
        });
        $[102] = Colors.textSecondary;
        $[103] = t34;
      } else {
        t34 = $[103];
      }
      let t35;
      if ($[104] !== onDismiss || $[105] !== styles.closeBtn || $[106] !== t34) {
        t35 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Pressable.default, {
          onPress: onDismiss,
          style: styles.closeBtn,
          accessibilityRole: "button",
          accessibilityLabel: "Close sector report",
          children: t34
        });
        $[104] = onDismiss;
        $[105] = styles.closeBtn;
        $[106] = t34;
        $[107] = t35;
      } else {
        t35 = $[107];
      }
      if ($[108] !== styles.header || $[109] !== t33 || $[110] !== t35) {
        t6 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.header,
          children: [t33, t35]
        });
        $[108] = styles.header;
        $[109] = t33;
        $[110] = t35;
        $[111] = t6;
      } else {
        t6 = $[111];
      }
      if ($[112] !== entries) {
        t7 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(SummaryBar, {
          entries: entries
        });
        $[112] = entries;
        $[113] = t7;
      } else {
        t7 = $[113];
      }
      if ($[114] !== Colors.danger || $[115] !== onCopyReport || $[116] !== styles.copyReportBtn || $[117] !== styles.copyReportText || $[118] !== styles.subsystemHeader || $[119] !== styles.subsystemHeaderText || $[120] !== styles.subsystemHint || $[121] !== styles.subsystemMsg || $[122] !== styles.subsystemName || $[123] !== styles.subsystemNote || $[124] !== styles.subsystemOverflow || $[125] !== styles.subsystemRow || $[126] !== subsystemErrors) {
        t8 = subsystemErrors && subsystemErrors.length > 0 && (() => {
          const overflowEntry = subsystemErrors.find(_temp4);
          const shownErrors = subsystemErrors.filter(_temp5);
          return /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
            style: styles.subsystemNote,
            children: [/*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
              style: styles.subsystemHeader,
              children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
                name: "alert-octagon",
                size: 12,
                color: Colors.danger
              }), /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Text.default, {
                style: styles.subsystemHeaderText,
                children: [shownErrors.length, " SUBSYSTEM ", shownErrors.length === 1 ? "ERROR" : "ERRORS", " DURING CATCH-UP"]
              })]
            }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
              style: styles.subsystemHint,
              children: "These systems were skipped on one or more simulated ticks. The simulation continued \u2014 please report persistent failures."
            }), shownErrors.map((e_1, i) => /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
              style: styles.subsystemRow,
              children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                style: styles.subsystemName,
                children: e_1.subsystem
              }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                style: styles.subsystemMsg,
                numberOfLines: 3,
                children: e_1.error || "unknown error"
              })]
            }, `${e_1.subsystem}-${i}`)), overflowEntry && /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
              style: styles.subsystemOverflow,
              children: overflowEntry.error
            }), onCopyReport && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Pressable.default, {
              onPress: onCopyReport,
              accessibilityRole: "button",
              accessibilityLabel: "Copy full error report",
              style: t36 => {
                const {
                  pressed
                } = t36;
                return [styles.copyReportBtn, pressed && {
                  opacity: 0.7
                }];
              },
              children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
                name: "clipboard",
                size: 12,
                color: Colors.danger
              }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                style: styles.copyReportText,
                children: "COPY REPORT"
              })]
            })]
          });
        })();
        $[114] = Colors.danger;
        $[115] = onCopyReport;
        $[116] = styles.copyReportBtn;
        $[117] = styles.copyReportText;
        $[118] = styles.subsystemHeader;
        $[119] = styles.subsystemHeaderText;
        $[120] = styles.subsystemHint;
        $[121] = styles.subsystemMsg;
        $[122] = styles.subsystemName;
        $[123] = styles.subsystemNote;
        $[124] = styles.subsystemOverflow;
        $[125] = styles.subsystemRow;
        $[126] = subsystemErrors;
        $[127] = t8;
      } else {
        t8 = $[127];
      }
      if ($[128] !== Colors.accent || $[129] !== catchupDurationLabel || $[130] !== resumedAmountLabel || $[131] !== showCatchupDuration || $[132] !== styles.catchupNote || $[133] !== styles.catchupText) {
        t9 = showCatchupDuration && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.catchupNote,
          children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
            name: "clock",
            size: 12,
            color: Colors.accent
          }), /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Text.default, {
            style: styles.catchupText,
            children: ["RESUMED ", resumedAmountLabel, " IN ", catchupDurationLabel]
          })]
        });
        $[128] = Colors.accent;
        $[129] = catchupDurationLabel;
        $[130] = resumedAmountLabel;
        $[131] = showCatchupDuration;
        $[132] = styles.catchupNote;
        $[133] = styles.catchupText;
        $[134] = t9;
      } else {
        t9 = $[134];
      }
      if ($[135] !== Colors.warning || $[136] !== autoTuneLabel || $[137] !== canAutoTune || $[138] !== onAutoTuneDepth || $[139] !== overshootHeadline || $[140] !== overshootHint || $[141] !== showOvershootWarning || $[142] !== styles.autoTuneBtn || $[143] !== styles.autoTuneText || $[144] !== styles.overshootHint || $[145] !== styles.overshootNote || $[146] !== styles.overshootText) {
        t10 = showOvershootWarning && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.overshootNote,
          children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
            name: "alert-triangle",
            size: 12,
            color: Colors.warning
          }), /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
            style: {
              flex: 1
            },
            children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
              style: styles.overshootText,
              children: overshootHeadline
            }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
              style: styles.overshootHint,
              children: overshootHint
            }), canAutoTune && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Pressable.default, {
              onPress: onAutoTuneDepth,
              accessibilityRole: "button",
              accessibilityLabel: autoTuneLabel,
              style: t36 => {
                const {
                  pressed: pressed_0
                } = t36;
                return [styles.autoTuneBtn, pressed_0 && {
                  opacity: 0.7
                }];
              },
              children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
                name: "sliders",
                size: 12,
                color: Colors.warning
              }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                style: styles.autoTuneText,
                children: autoTuneLabel
              })]
            })]
          })]
        });
        $[135] = Colors.warning;
        $[136] = autoTuneLabel;
        $[137] = canAutoTune;
        $[138] = onAutoTuneDepth;
        $[139] = overshootHeadline;
        $[140] = overshootHint;
        $[141] = showOvershootWarning;
        $[142] = styles.autoTuneBtn;
        $[143] = styles.autoTuneText;
        $[144] = styles.overshootHint;
        $[145] = styles.overshootNote;
        $[146] = styles.overshootText;
        $[147] = t10;
      } else {
        t10 = $[147];
      }
      if ($[148] !== Colors.warning || $[149] !== extrapolatedTicks || $[150] !== showExtrapolationNote || $[151] !== simulatedTicks || $[152] !== styles.extrapolationNote || $[153] !== styles.extrapolationText) {
        t11 = showExtrapolationNote && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.extrapolationNote,
          children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
            name: "alert-triangle",
            size: 12,
            color: Colors.warning
          }), /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Text.default, {
            style: styles.extrapolationText,
            children: [simulatedTicks, " TICK", simulatedTicks !== 1 ? "S" : "", " FULLY SIMULATED \u2022 ", extrapolatedTicks, " ESTIMATED FROM RATES"]
          })]
        });
        $[148] = Colors.warning;
        $[149] = extrapolatedTicks;
        $[150] = showExtrapolationNote;
        $[151] = simulatedTicks;
        $[152] = styles.extrapolationNote;
        $[153] = styles.extrapolationText;
        $[154] = t11;
      } else {
        t11 = $[154];
      }
      if ($[155] !== Colors.info || $[156] !== depthHint || $[157] !== depthLabel || $[158] !== showDepthNote || $[159] !== simulatedTicks || $[160] !== styles.depthHint || $[161] !== styles.depthNote || $[162] !== styles.depthText || $[163] !== tickCount) {
        t12 = showDepthNote && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.depthNote,
          children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
            name: "sliders",
            size: 12,
            color: Colors.info
          }), /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
            style: {
              flex: 1
            },
            children: [/*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Text.default, {
              style: styles.depthText,
              children: ["OFFLINE DEPTH: ", depthLabel.toUpperCase(), " \u2014 FULLY SIMULATED ", simulatedTicks, " / ", tickCount, " TICKS"]
            }), depthHint && /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
              style: styles.depthHint,
              children: depthHint
            })]
          })]
        });
        $[155] = Colors.info;
        $[156] = depthHint;
        $[157] = depthLabel;
        $[158] = showDepthNote;
        $[159] = simulatedTicks;
        $[160] = styles.depthHint;
        $[161] = styles.depthNote;
        $[162] = styles.depthText;
        $[163] = tickCount;
        $[164] = t12;
      } else {
        t12 = $[164];
      }
      if ($[165] !== styles.scanline) {
        t13 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(View.default, {
          style: styles.scanline
        });
        $[165] = styles.scanline;
        $[166] = t13;
      } else {
        t13 = $[166];
      }
      T0 = ScrollView.default;
      t1 = styles.scroll;
      t2 = false;
      if ($[167] === Symbol.for("react.memo_cache_sentinel")) {
        t3 = {
          paddingBottom: 8
        };
        $[167] = t3;
      } else {
        t3 = $[167];
      }
      t4 = entries.length === 0 ? /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: {
          alignItems: "center",
          paddingVertical: 32,
          gap: 12
        },
        children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: {
            color: Colors.textMuted,
            fontFamily: "Inter_600SemiBold",
            fontSize: 13,
            letterSpacing: 1.5
          },
          children: "NO DATA AVAILABLE"
        }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: {
            color: Colors.textMuted,
            fontFamily: "Inter_400Regular",
            fontSize: 11,
            textAlign: "center",
            lineHeight: 18,
            paddingHorizontal: 16
          },
          children: "The simulation has not yet generated any report entries. Allow the city ticker to run to receive sector updates."
        })]
      }) : categories.map(_temp6);
      $[0] = Colors;
      $[1] = catchupWallMs;
      $[2] = entries;
      $[3] = estimatedWallMs;
      $[4] = extrapolatedTicks;
      $[5] = insets.bottom;
      $[6] = offlineSimDepth;
      $[7] = onAutoTuneDepth;
      $[8] = onCopyReport;
      $[9] = onDismiss;
      $[10] = recentOvershootCount;
      $[11] = simulatedTicks;
      $[12] = styles.autoTuneBtn;
      $[13] = styles.autoTuneText;
      $[14] = styles.catchupNote;
      $[15] = styles.catchupText;
      $[16] = styles.closeBtn;
      $[17] = styles.copyReportBtn;
      $[18] = styles.copyReportText;
      $[19] = styles.depthHint;
      $[20] = styles.depthNote;
      $[21] = styles.depthText;
      $[22] = styles.extrapolationNote;
      $[23] = styles.extrapolationText;
      $[24] = styles.header;
      $[25] = styles.overlay;
      $[26] = styles.overshootHint;
      $[27] = styles.overshootNote;
      $[28] = styles.overshootText;
      $[29] = styles.panel;
      $[30] = styles.scanline;
      $[31] = styles.scroll;
      $[32] = styles.subsystemHeader;
      $[33] = styles.subsystemHeaderText;
      $[34] = styles.subsystemHint;
      $[35] = styles.subsystemMsg;
      $[36] = styles.subsystemName;
      $[37] = styles.subsystemNote;
      $[38] = styles.subsystemOverflow;
      $[39] = styles.subsystemRow;
      $[40] = styles.subtitle;
      $[41] = styles.title;
      $[42] = subsystemErrors;
      $[43] = tickCount;
      $[44] = visible;
      $[45] = T0;
      $[46] = T1;
      $[47] = T2;
      $[48] = T3;
      $[49] = t1;
      $[50] = t10;
      $[51] = t11;
      $[52] = t12;
      $[53] = t13;
      $[54] = t14;
      $[55] = t15;
      $[56] = t16;
      $[57] = t17;
      $[58] = t18;
      $[59] = t2;
      $[60] = t3;
      $[61] = t4;
      $[62] = t5;
      $[63] = t6;
      $[64] = t7;
      $[65] = t8;
      $[66] = t9;
    } else {
      T0 = $[45];
      T1 = $[46];
      T2 = $[47];
      T3 = $[48];
      t1 = $[49];
      t10 = $[50];
      t11 = $[51];
      t12 = $[52];
      t13 = $[53];
      t14 = $[54];
      t15 = $[55];
      t16 = $[56];
      t17 = $[57];
      t18 = $[58];
      t2 = $[59];
      t3 = $[60];
      t4 = $[61];
      t5 = $[62];
      t6 = $[63];
      t7 = $[64];
      t8 = $[65];
      t9 = $[66];
    }
    let t19;
    if ($[168] !== T0 || $[169] !== t1 || $[170] !== t2 || $[171] !== t3 || $[172] !== t4) {
      t19 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(T0, {
        style: t1,
        showsVerticalScrollIndicator: t2,
        contentContainerStyle: t3,
        children: t4
      });
      $[168] = T0;
      $[169] = t1;
      $[170] = t2;
      $[171] = t3;
      $[172] = t4;
      $[173] = t19;
    } else {
      t19 = $[173];
    }
    let t20;
    if ($[174] !== styles.dismissText) {
      t20 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: styles.dismissText,
        children: "ACKNOWLEDGE REPORT"
      });
      $[174] = styles.dismissText;
      $[175] = t20;
    } else {
      t20 = $[175];
    }
    let t21;
    if ($[176] !== onDismiss || $[177] !== styles.dismissBtn || $[178] !== t20) {
      t21 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Pressable.default, {
        onPress: onDismiss,
        style: styles.dismissBtn,
        children: t20
      });
      $[176] = onDismiss;
      $[177] = styles.dismissBtn;
      $[178] = t20;
      $[179] = t21;
    } else {
      t21 = $[179];
    }
    let t22;
    if ($[180] !== T1 || $[181] !== t10 || $[182] !== t11 || $[183] !== t12 || $[184] !== t13 || $[185] !== t19 || $[186] !== t21 || $[187] !== t5 || $[188] !== t6 || $[189] !== t7 || $[190] !== t8 || $[191] !== t9) {
      t22 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(T1, {
        style: t5,
        children: [t6, t7, t8, t9, t10, t11, t12, t13, t19, t21]
      });
      $[180] = T1;
      $[181] = t10;
      $[182] = t11;
      $[183] = t12;
      $[184] = t13;
      $[185] = t19;
      $[186] = t21;
      $[187] = t5;
      $[188] = t6;
      $[189] = t7;
      $[190] = t8;
      $[191] = t9;
      $[192] = t22;
    } else {
      t22 = $[192];
    }
    let t23;
    if ($[193] !== T2 || $[194] !== t14 || $[195] !== t22) {
      t23 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(T2, {
        style: t14,
        children: t22
      });
      $[193] = T2;
      $[194] = t14;
      $[195] = t22;
      $[196] = t23;
    } else {
      t23 = $[196];
    }
    let t24;
    if ($[197] !== T3 || $[198] !== t15 || $[199] !== t16 || $[200] !== t17 || $[201] !== t18 || $[202] !== t23) {
      t24 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(T3, {
        visible: t15,
        animationType: t16,
        transparent: t17,
        onRequestClose: t18,
        children: t23
      });
      $[197] = T3;
      $[198] = t15;
      $[199] = t16;
      $[200] = t17;
      $[201] = t18;
      $[202] = t23;
      $[203] = t24;
    } else {
      t24 = $[203];
    }
    return t24;
  }
  function _temp6(cat) {
    return /*#__PURE__*/(0, _reactJsxRuntime.jsx)(CategorySection, {
      category: cat
    }, cat.title);
  }
  function _temp5(e_0) {
    return e_0.subsystem !== _engineFormulas.CATCHUP_ERRORS_OVERFLOW_SUBSYSTEM;
  }
  function _temp4(e) {
    return e.subsystem === _engineFormulas.CATCHUP_ERRORS_OVERFLOW_SUBSYSTEM;
  }
  const useStyles = (0, _hooksUseThemedStyles.makeThemedStyles)(Colors => StyleSheet.default.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.8)",
      justifyContent: "flex-start",
      paddingTop: 12
    },
    panel: {
      backgroundColor: Colors.bgCard,
      borderTopWidth: 2,
      borderTopColor: Colors.accent,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderLeftColor: Colors.borderBright,
      borderRightColor: Colors.borderBright,
      maxHeight: "96%",
      paddingHorizontal: 14,
      paddingTop: 12
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8
    },
    title: {
      color: Colors.accent,
      fontFamily: "Inter_700Bold",
      fontSize: 18,
      letterSpacing: 2
    },
    subtitle: {
      color: Colors.textMuted,
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      letterSpacing: 1,
      marginTop: 2
    },
    closeBtn: {
      padding: 4
    },
    summaryBar: {
      flexDirection: "row",
      gap: 16,
      marginBottom: 10
    },
    summaryItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4
    },
    summaryText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 12
    },
    scanline: {
      height: 1,
      backgroundColor: Colors.borderBright,
      marginBottom: 12
    },
    subsystemNote: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: Colors.danger,
      borderLeftWidth: 3,
      borderRadius: 3,
      backgroundColor: "rgba(200,50,60,0.10)"
    },
    subsystemHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    subsystemHeaderText: {
      flex: 1,
      color: Colors.danger,
      fontFamily: "Inter_700Bold",
      fontSize: 10,
      letterSpacing: 1
    },
    subsystemHint: {
      color: Colors.textMuted,
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      lineHeight: 14,
      marginTop: 4,
      marginBottom: 4
    },
    subsystemRow: {
      borderLeftWidth: 2,
      borderLeftColor: Colors.danger,
      paddingLeft: 8,
      paddingVertical: 3,
      marginTop: 4
    },
    subsystemName: {
      color: "#ff8a91",
      fontFamily: "Inter_700Bold",
      fontSize: 11,
      letterSpacing: 0.5,
      marginBottom: 1
    },
    subsystemMsg: {
      color: Colors.text,
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      lineHeight: 15
    },
    subsystemOverflow: {
      color: "#ff8a91",
      fontFamily: "Inter_700Bold",
      fontSize: 11,
      letterSpacing: 0.3,
      marginTop: 6
    },
    copyReportBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 8,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: Colors.danger,
      borderRadius: 3,
      backgroundColor: "rgba(200,50,60,0.12)"
    },
    copyReportText: {
      color: "#ff8a91",
      fontFamily: "Inter_700Bold",
      fontSize: 10,
      letterSpacing: 1
    },
    catchupNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: Colors.accent,
      borderRadius: 3,
      backgroundColor: "rgba(0,255,170,0.06)"
    },
    catchupText: {
      flex: 1,
      color: Colors.accent,
      fontFamily: "Inter_600SemiBold",
      fontSize: 10,
      letterSpacing: 1
    },
    overshootNote: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: Colors.warning,
      borderRadius: 3,
      backgroundColor: "rgba(255,170,0,0.08)"
    },
    overshootText: {
      color: Colors.warning,
      fontFamily: "Inter_600SemiBold",
      fontSize: 10,
      letterSpacing: 1
    },
    overshootHint: {
      color: Colors.textMuted,
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      marginTop: 2
    },
    autoTuneBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: Colors.warning,
      borderRadius: 3,
      backgroundColor: "rgba(255,170,0,0.12)"
    },
    autoTuneText: {
      color: Colors.warning,
      fontFamily: "Inter_700Bold",
      fontSize: 10,
      letterSpacing: 1
    },
    extrapolationNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: Colors.warning,
      borderRadius: 3,
      backgroundColor: "rgba(255,170,0,0.08)"
    },
    extrapolationText: {
      flex: 1,
      color: Colors.warning,
      fontFamily: "Inter_600SemiBold",
      fontSize: 10,
      letterSpacing: 1
    },
    depthNote: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: Colors.info,
      borderRadius: 3,
      backgroundColor: "rgba(80,160,255,0.08)"
    },
    depthText: {
      color: Colors.info,
      fontFamily: "Inter_600SemiBold",
      fontSize: 10,
      letterSpacing: 1
    },
    depthHint: {
      color: Colors.textMuted,
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      marginTop: 2
    },
    scroll: {
      flex: 1,
      marginBottom: 16
    },
    categorySection: {
      marginBottom: 16
    },
    categoryHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6
    },
    categoryTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 10,
      letterSpacing: 1.5
    },
    categoryLine: {
      flex: 1,
      height: 1,
      opacity: 0.3
    },
    entryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingVertical: 6,
      paddingLeft: 20,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border
    },
    entryLeft: {
      flex: 1,
      paddingRight: 12
    },
    entryLabel: {
      color: Colors.text,
      fontFamily: "Inter_600SemiBold",
      fontSize: 13
    },
    entryReason: {
      color: Colors.textMuted,
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      marginTop: 2
    },
    entryDelta: {
      fontFamily: "Inter_700Bold",
      fontSize: 14
    },
    dismissBtn: {
      borderWidth: 1,
      borderColor: Colors.accent,
      borderRadius: 4,
      padding: 14,
      alignItems: "center"
    },
    dismissText: {
      color: Colors.accent,
      fontFamily: "Inter_700Bold",
      fontSize: 13,
      letterSpacing: 2
    }
  }));
},1877,[11,723,13,480,126,365,282,148,135,274,377,798,993,895,949,6]);