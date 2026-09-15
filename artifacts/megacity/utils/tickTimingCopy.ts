export const REALTIME_TICK_INTERVALS = [1, 5, 10, 15, 60] as const;

export const REALTIME_CLOCK_EXPLANATION = `These settings are real-world time between automatic ticks. Every tick always advances 6 in-game hours, so 4 ticks = 1 in-game day.

1M = 1 game day every 4 real minutes
5M = 1 game day every 20 real minutes
10M = 1 game day every 40 real minutes
15M = 1 game day every 60 real minutes
1H = 1 game day every 4 real hours

Faster settings make ticks happen more often; they do not change how much city time each tick represents.

Paused and turn-based cities do not auto-advance. In real-time mode, offline catch-up uses your selected interval.`;