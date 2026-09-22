<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Predict Game 7. PostHog JS and the React bindings (`posthog-js`, `@posthog/react`) were installed and the app was wrapped with `PostHogProvider` and `PostHogErrorBoundary` in `src/main.tsx`. Ten events were instrumented across three pages and the auth context, covering the full prediction flow, home page engagement, historical data exploration, and user authentication. Errors are captured automatically via the error boundary and manually via `captureException` in the catch blocks of the prediction and contact form handlers. Users are identified by Supabase user ID on sign-in and sign-up, with `posthog.reset()` called on sign-out.

| Event | Description | File |
|---|---|---|
| `series_selected` | User selects a series (current, historical) from the dialog on the Predict page | `src/pages/PredictPage.tsx` |
| `custom_series_selected` | User chooses to create a custom matchup instead of a pre-existing series | `src/pages/PredictPage.tsx` |
| `prediction_method_selected` | User selects a statistical prediction method (logistic regression, Bayes, Elo, etc.) | `src/pages/PredictPage.tsx` |
| `prediction_generated` | User successfully runs a Game 7 prediction — the core conversion event | `src/pages/PredictPage.tsx` |
| `detailed_analysis_viewed` | User clicks "View Detailed Analysis" after a prediction result is shown | `src/pages/PredictPage.tsx` |
| `prediction_reset` | User clicks "New Prediction" to start over | `src/pages/PredictPage.tsx` |
| `banner_hotspot_clicked` | User clicks an iconic moment hotspot on the home page banner | `src/pages/HomePage.tsx` |
| `contact_form_submitted` | User successfully submits the contact form | `src/pages/HomePage.tsx` |
| `historical_series_expanded` | User clicks a series row on the Historical page to see game-by-game scores | `src/pages/HistoricalPage.tsx` |
| `historical_filter_applied` | User applies a year or team search filter on the Historical page | `src/pages/HistoricalPage.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/1649509)
- [Prediction Funnel: Series → Method → Prediction](/insights/cu0V4HPZ)
- [Predictions Generated Over Time](/insights/yvqS2lrG)
- [Prediction Method Popularity](/insights/AG3q5cBJ)
- [Detailed Analysis Conversion Rate](/insights/1pJhGfUS)
- [Home Page Engagement](/insights/CvuW5ySs)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
