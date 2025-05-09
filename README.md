NOTE: This project is incompelete, you can retrain the model and use the scrape the data from the site in the folder data.
I'm too lazy to continue.

# Football Match Prediction System

This application uses TensorFlow.js to predict football match outcomes for the Primera B Metropolitana 2025 season. It analyzes past match data, player statistics, and team performance to predict:

- Final scores
- Goal scorers
- Approximate time of goals

## Features

- Machine learning model with attention mechanism highlighting in-form players
- Real-time prediction updates based on new match data
- Interactive UI with scrollable match prediction cards
- Visualization of prediction accuracy with comparative charts
- Feedback loop system for continuous model improvement
- Form tracking for teams and individual players
- PostgreSQL integration for data storage and retrieval

## Tech Stack

- **Frontend**: React, TailwindCSS, Chart.js
- **Backend**: Node.js, Express
- **Machine Learning**: TensorFlow.js
- **Database**: PostgreSQL

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the `.env.example` file to `.env` and configure your database connection
4. Run database migrations (see Database Setup below)
5. Start the development server:
   ```
   npm run dev
   ```

### Database Setup

This application requires a PostgreSQL database with the following tables:

- `matches`: Stores match data (teams, lineups, scores, etc.)
- `predictions`: Stores model predictions for matches
- `prediction_feedback`: Stores feedback on prediction accuracy
- `embeddings`: Stores player and team embeddings

Please run the SQL scripts in the `scripts/db` directory to set up your database schema.

## Usage

### Training the Model

To train the model with the latest match data:

```
npm run train
```

### Making Predictions

To predict outcomes for upcoming matches:

```
npm run predict
```

### Evaluating Model Performance

To evaluate the accuracy of past predictions:

```
node src/server/evaluateModel.js
```

## Project Structure

- `/src/components`: React components for the UI
- `/src/server`: Node.js backend and TensorFlow model
- `/src/types`: TypeScript type definitions
- `/src/api`: API service for frontend-backend communication

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
