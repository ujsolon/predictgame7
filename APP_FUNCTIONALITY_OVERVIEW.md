# App Functionality Overview

This document summarizes the current functionality of the Predict Game 7 app in a way that can support marketing, brand strategy, content planning, and social media brainstorming.

## Product Summary

Predict Game 7 is a basketball analytics app focused on one of the most emotionally charged situations in sports: Game 7. It gives users a way to explore historical series-deciding games, view statistical patterns, understand the math behind predictive models, and generate win probability predictions for real or custom playoff matchups.

The app is built around the idea that Game 7 is not just entertainment. It is a moment where history, pressure, momentum, and probability collide.

## Core Value Proposition

The app helps users:

- explore historical NBA and related playoff deciders in one place
- analyze Game 7 outcomes through statistics and probability
- compare different predictive methods instead of relying on one black-box model
- experiment with custom matchups and scorelines
- understand the reasoning behind a prediction, not just the output

## Primary Audience

Potential audiences include:

- NBA fans who enjoy historical debates and playoff narratives
- sports bettors and prediction-minded users
- basketball content creators
- data-curious fans who like analytics but want it presented accessibly
- journalists, newsletter writers, and social media pages covering playoff storylines

## Main User Journeys

### 1. Discover the platform

The home page introduces the app as a Game 7 prediction and basketball data product.

It highlights:

- the product mission
- iconic Game 7 moments
- the main prediction workflow
- links into historical data and insights
- an explanation of the product story and purpose
- a contact form for questions, feedback, and future collaboration

### 2. Predict a Game 7 outcome

The Predict page is the app's main interactive experience.

Users can:

- choose a historical or active series
- deep-link directly into a specific series from the home page
- create a custom series by entering team names and Game 1-6 scores
- select from multiple predictive methods
- generate a win probability prediction
- view the predicted winner, team probabilities, and contributing factors
- open a more detailed analysis view after prediction

The prediction flow supports both real series data and fictional or hypothetical matchups.

### 3. Browse historical Game 7 archives

The Historical page acts as a searchable archive of series-deciding games.

Users can:

- browse historical Game 7 series
- filter by year
- search by team name
- review matchup information and round context
- view final scores
- open an expanded series panel with game-by-game score details
- see the winning team and overall series status

This page supports both discovery and research behavior.

### 4. Explore high-level analytics

The Insights page translates historical data into simpler patterns and talking points.

Current insights include:

- Game 6 winner impact
- home court advantage
- average point differential in Game 7s
- summary pattern cards that turn stats into readable takeaways

This page is especially useful for marketing, social content, and educational storytelling because it already surfaces short-form insight language.

### 5. Learn the methodology

The Maths page explains how the predictive models work.

It currently presents four major methods:

- Logistic Regression
- Bayesian Inference
- Elo Rating System
- Exponential Smoothing

For each method, the page provides:

- a simple title and positioning
- a mathematical formula
- a conceptual explanation of how the model thinks

This makes the app more transparent and gives it educational value beyond pure prediction.

## Prediction System Features

The app includes a prediction engine powered by a Supabase Edge Function.

Current prediction features include:

- score-based prediction using Games 1-6 inputs
- support for multiple model types
- calculation of win probability for each team
- predicted winner output
- confidence level output
- contributing factor summaries
- computation time reporting
- support for team logo display in prediction results

### Supported prediction modes

- historical series prediction
- active series prediction, when current series exist in the data
- custom user-created series prediction

### Supported team identity inputs for custom mode

Custom team logo matching now supports:

- full team name
- team nickname
- team abbreviation

Examples:

- `Boston Celtics`
- `Celtics`
- `BOS`

Custom mode also includes placeholder logos for Team A and Team B before the user enters a recognizable team.

## Data and Content Features

The app now uses a normalized basketball data model built around:

- teams
- series
- series game scores
- cached insights
- prediction methods

This allows the app to:

- reuse canonical team records
- attach one logo URL per team
- store full series scoring data
- support historical browsing and prediction from the same data layer

### Team identity and logos

The app now supports:

- canonical team records in the `teams` table
- a logo URL stored per team
- modern and historical franchise coverage
- fallback alias matching in the frontend logo system

This matters for both product quality and visual branding because team identity is a visible part of nearly every page.

## Visual and UX Features

Across the app, the experience includes:

- team logos and matchup presentation
- direct navigation into prediction flows
- historical and current series browsing
- modal and expanded-detail views
- explanation-oriented result presentation
- educational methodology references

The product is not only a calculator. It also works as a sports storytelling and discovery experience.

## Content and Story Angles the App Naturally Supports

Because of its functionality, the app can support content around:

- Game 7 history
- before-and-after playoff storylines
- probability versus emotion
- model comparisons
- famous upsets and collapses
- momentum and home court debates
- fan hypothetical matchups
- educational sports analytics content

## Marketing-Relevant Product Strengths

These are the strongest functional hooks for marketing and social presence:

- a clear niche: Game 7 only
- a strong emotional subject: high-stakes winner-take-all basketball
- visual recognizability through team logos and famous matchups
- built-in historical content for recurring posts
- built-in predictions for timely playoff conversation
- custom mode for interactive audience participation
- methodology pages for credibility and educational positioning
- insights page for easily shareable stat-driven posts

## Good Messaging Themes

Possible messaging territories based on current functionality:

- "Where data meets playoff drama"
- "Decode the biggest game in basketball"
- "Every Game 7 has a history"
- "Not just who wins, but why"
- "From iconic classics to hypothetical showdowns"

## Social Media Content Opportunities Based on Existing Features

The app's current functionality supports recurring content formats such as:

- historical Game 7 flashbacks
- "What would the model say?" posts
- matchup prediction cards
- probability reveal graphics
- stat-of-the-day content from the insights page
- educational explainers around the different models
- custom fan-submitted matchup predictions
- famous Game 7 anniversary posts

## Product Positioning Options

Depending on brand direction, the app could be positioned as:

- a basketball analytics platform
- a playoff prediction engine
- a Game 7 history archive
- a fan engagement and debate tool
- a sports storytelling product powered by statistics

## Short Functional Description

Predict Game 7 is a basketball analytics app that helps users explore historic series-deciding games, generate Game 7 win probabilities, compare prediction models, and understand the statistical patterns behind the most pressurized games in basketball.

## One-Line Elevator Pitch

Predict Game 7 turns the biggest game in basketball into a searchable, explainable, and shareable analytics experience.
