import { runDailySync } from "../src/lib/pipeline";

async function main() {
  const snapshot = await runDailySync();

  console.log(
    JSON.stringify(
      {
        generatedAt: snapshot.generatedAt,
        mode: snapshot.mode,
        summary: snapshot.summary,
        topPlaces: snapshot.places.slice(0, 5).map((place) => ({
          name: place.name,
          region: place.regionId,
          category: place.category,
          rating: place.rating,
          reviews: place.userRatingCount,
          priority: place.priority,
          monthlyRevenue: place.estimatedMonthlyRevenue,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
