# Sports Prediction Site --- Updated Version

## 1. Project Goal

Improve the sports prediction website so that visitors can quickly see
match predictions, understand why each pick was made, and easily access
the next step. The site should have a simpler, cleaner interface and a
sustainable revenue model suited to the Nigerian market.

## 2. UI and User Experience Improvements

-   Improve the overall visual appearance with a modern, polished,
    mobile-first design.
-   Simplify navigation and reduce unnecessary menus, sections, and
    clicks.
-   Make the interface easy to scan on mobile devices, since many users
    will visit from their phones.
-   Use clear typography, consistent spacing, readable cards, and strong
    visual hierarchy.
-   Keep the most important information visible without requiring users
    to scroll through a long introduction.

## 3. Make Match Predictions the First Thing Users See

The homepage should open directly on the latest match predictions---not
a hero banner, lengthy introduction, or generic marketing content.

Each match card should show:

-   Home team vs. away team
-   Competition and kickoff time
-   The predicted outcome
-   The probability for each 1X2 outcome
-   A link or button to view the detailed analysis

Display upcoming matches prominently and make it clear when predictions
were last updated.

## 4. Show 1X2 Probabilities on the First Page

Show all three standard football-result options directly on each match
card:

-   **1 --- Home win:** `__%`
-   **X --- Draw:** `__%`
-   **2 --- Away win:** `__%`

The three probabilities should be visible together on the homepage so
users do not have to open a match to compare them.

### Probability display requirements

-   Use a consistent layout for 1, X, and 2 across all match cards.
-   Make the percentages easy to read on small screens.
-   Ensure the three probabilities add up to approximately 100%,
    allowing for rounding.
-   Label them as model estimates, not guarantees.
-   Do not display invented or unsupported probabilities. If reliable
    data is unavailable, show that the prediction is unavailable rather
    than fabricating a number.

## 5. Add Detailed Reasoning for Every Pick

Every match should have a **"Why this prediction?"** section explaining
the reasoning behind the estimated outcome.

Where reliable information is available, cover:

-   **Recent form:** Results and performance in recent matches.
-   **Home and away performance:** How each team performs in the
    relevant setting.
-   **Head-to-head record:** Previous meetings, with appropriate
    context.
-   **Goals and defensive performance:** Scoring rates, goals conceded,
    clean sheets, and relevant trends.
-   **Player availability:** Confirmed injuries, suspensions, and
    doubts.
-   **Possible lineups:** Likely starting players, formation, and
    important tactical matchups.
-   **Fixture context:** Rest days, travel, fixture congestion, and
    competition circumstances.
-   **Key factors and uncertainty:** The strongest reasons for the pick
    and the factors that could make it wrong.

### Lineup accuracy

Clearly distinguish **confirmed lineups** from **predicted lineups**.
Before official lineups are released, label them as possible or
projected lineups and state when the information was last checked. Never
present a speculative lineup or unverified injury report as confirmed
information.

Keep the summary concise on the match card, with a **"Read full
analysis"** option for users who want the complete reasoning.

