<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Models\Athlete;
use Illuminate\Support\Facades\DB;

/**
 * Retiring the `suspended` status (#1427).
 *
 * Two things here have consequences beyond a dropdown losing an entry, and
 * they are the two worth testing: what happens to rows that already say
 * `suspended`, and what happens to a spreadsheet that still says `sospeso`.
 */

it('turns every suspended athlete into an inactive one', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => 'active']);
    // Straight past the model: the enum no longer has the case, which is
    // rather the point — this is what a database written before the change
    // looks like.
    DB::table('athletes')->where('id', $athlete->id)->update(['status' => 'suspended']);

    $migration = require base_path('database/migrations/2026_09_08_090000_retire_the_suspended_athlete_status.php');
    $migration->up();

    expect(DB::table('athletes')->where('id', $athlete->id)->value('status'))->toBe('inactive');
});

it('leaves the athletes who were already inactive exactly as they were', function (): void {
    // The reason `down()` is a no-op. After this runs there is no way to tell
    // these apart from the migrated ones, so a reversal would have to suspend
    // both — inventing history for rows that were never suspended.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => 'inactive']);

    $migration = require base_path('database/migrations/2026_09_08_090000_retire_the_suspended_athlete_status.php');
    $migration->up();

    expect($athlete->fresh()?->status)->toBe(AthleteStatus::Inactive);
});

it('runs cleanly on a database that has no suspended rows at all', function (): void {
    // Which is every database that migrates after this ships, and most of the
    // ones before it.
    $user = userWithAcademy();
    Athlete::factory()->for($user->academy)->count(3)->create(['status' => 'active']);

    $migration = require base_path('database/migrations/2026_09_08_090000_retire_the_suspended_athlete_status.php');
    $migration->up();

    expect(Athlete::query()->where('status', 'active')->count())->toBe(3);
});

it('still reads "sospeso" out of a spreadsheet, and files it as inactive', function (): void {
    // A register written before this change says what it says. Refusing those
    // rows would punish an academy for our vocabulary change — and the import
    // exists precisely to take a file nobody prepared for us (#1346).
    $user = userWithAcademy();
    $file = Illuminate\Http\UploadedFile::fake()->createWithContent(
        'atleti.csv',
        "Nome;Cognome;Cintura;Stato\nMarco;Rossi;blu;sospeso\nLuca;Bianchi;bianca;suspended\n",
    );

    $response = $this->actingAs($user)
        ->post('/api/v1/athletes/import', ['file' => $file, 'validate_only' => false])
        ->assertOk();

    expect($response->json('data.imported'))->toBe(2)
        ->and($response->json('data.rows.0.values.status'))->toBe('inactive')
        ->and($response->json('data.rows.1.values.status'))->toBe('inactive');
});
