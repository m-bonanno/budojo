<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    $this->user = User::factory()->create();
    $this->academy = Academy::factory()->create(['user_id' => $this->user->id]);
    Sanctum::actingAs($this->user);
});

function athleteNamed(Academy $academy, string $lastName): Athlete
{
    return Athlete::factory()->create([
        'academy_id' => $academy->id,
        'first_name' => 'Athlete',
        'last_name' => $lastName,
        'belt' => Belt::White,
        'stripes' => 0,
        'status' => AthleteStatus::Active,
        'joined_at' => now()->subYears(2),
    ]);
}

/**
 * @param  list<string>  $days  `Y-m-d` strings
 */
function attendedOn(Athlete $athlete, array $days): void
{
    foreach ($days as $day) {
        AttendanceRecord::factory()->create([
            'athlete_id' => $athlete->id,
            'attended_on' => $day,
        ]);
    }
}

it('counts this month and all time separately', function (): void {
    $athlete = athleteNamed($this->academy, 'Rossi');
    attendedOn($athlete, [
        now()->startOfMonth()->toDateString(),
        now()->startOfMonth()->addDays(2)->toDateString(),
        now()->subMonth()->startOfMonth()->addDay()->toDateString(),
    ]);

    $row = $this->getJson('/api/v1/athletes')->json('data.0');

    expect($row['attendance_month_count'])->toBe(2)
        ->and($row['attendance_total_count'])->toBe(3);
});

it('reports zero for an athlete who has never trained', function (): void {
    athleteNamed($this->academy, 'Rossi');

    $row = $this->getJson('/api/v1/athletes')->json('data.0');

    expect($row['attendance_month_count'])->toBe(0)
        ->and($row['attendance_total_count'])->toBe(0);
});

it('does not count a day that was corrected away', function (): void {
    // A mistake is fixed by soft-deleting the record and re-inserting, which
    // is the only reason there is no DB-level unique index on (athlete, day) —
    // see the create_attendance_records migration. If the count did not honour
    // the SoftDeletes scope, correcting a mistake would inflate the roster.
    $athlete = athleteNamed($this->academy, 'Rossi');
    $day = now()->startOfMonth()->toDateString();
    attendedOn($athlete, [$day]);
    AttendanceRecord::query()->where('athlete_id', $athlete->id)->delete();
    attendedOn($athlete, [$day]);

    $row = $this->getJson('/api/v1/athletes')->json('data.0');

    expect($row['attendance_month_count'])->toBe(1)
        ->and($row['attendance_total_count'])->toBe(1);
});

it('counts only the athlete their own sessions belong to', function (): void {
    $rossi = athleteNamed($this->academy, 'Rossi');
    $bianchi = athleteNamed($this->academy, 'Bianchi');
    attendedOn($rossi, [now()->startOfMonth()->toDateString()]);

    $rows = collect($this->getJson('/api/v1/athletes?sort_by=last_name&sort_order=asc')->json('data'))
        ->keyBy('last_name');

    expect($rows['Rossi']['attendance_month_count'])->toBe(1)
        ->and($rows['Bianchi']['attendance_month_count'])->toBe(0);
});

it('sorts by the current month count', function (): void {
    $quiet = athleteNamed($this->academy, 'Quiet');
    $busy = athleteNamed($this->academy, 'Busy');
    attendedOn($busy, [
        now()->startOfMonth()->toDateString(),
        now()->startOfMonth()->addDay()->toDateString(),
    ]);
    attendedOn($quiet, [now()->startOfMonth()->toDateString()]);

    $names = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=desc')
        ->json('data'))
        ->pluck('last_name')
        ->all();

    expect($names)->toBe(['Busy', 'Quiet']);
});

it('sorts by the all-time count independently of this month', function (): void {
    // The two columns answer different questions, and the athlete who has
    // trained for years but skipped this month is exactly where they diverge.
    $veteran = athleteNamed($this->academy, 'Veteran');
    $newcomer = athleteNamed($this->academy, 'Newcomer');
    attendedOn($veteran, [
        now()->subMonths(2)->startOfMonth()->toDateString(),
        now()->subMonths(2)->startOfMonth()->addDay()->toDateString(),
        now()->subMonth()->startOfMonth()->toDateString(),
    ]);
    attendedOn($newcomer, [now()->startOfMonth()->toDateString()]);

    $byMonth = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=desc')
        ->json('data'))->pluck('last_name')->all();
    $byTotal = collect($this->getJson('/api/v1/athletes?sort_by=attendance_total&sort_order=desc')
        ->json('data'))->pluck('last_name')->all();

    expect($byMonth)->toBe(['Newcomer', 'Veteran'])
        ->and($byTotal)->toBe(['Veteran', 'Newcomer']);
});

it('breaks count ties by name so paging cannot drop or repeat a row', function (): void {
    // Counts are small integers over a roster of hundreds, so ties are the
    // common case. Without a stable second key the tied block reorders itself
    // between requests and an athlete can land on two pages or none.
    foreach (['Rossi', 'Bianchi', 'Verdi', 'Anselmi'] as $name) {
        athleteNamed($this->academy, $name);
    }

    $first = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=desc')
        ->json('data'))->pluck('last_name')->all();
    $second = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=desc')
        ->json('data'))->pluck('last_name')->all();

    expect($first)->toBe(['Anselmi', 'Bianchi', 'Rossi', 'Verdi'])
        ->and($second)->toBe($first);
});

it('keeps the tiebreak ascending when the count sorts ascending', function (): void {
    // The names are a stable key, not a second dimension the user asked to
    // reverse — flipping them with the count would make "least sessions" list
    // people backwards for no reason they could name.
    foreach (['Rossi', 'Bianchi'] as $name) {
        athleteNamed($this->academy, $name);
    }

    $names = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=asc')
        ->json('data'))->pluck('last_name')->all();

    expect($names)->toBe(['Bianchi', 'Rossi']);
});

it('leaves the counts null on show, where they are not selected', function (): void {
    $athlete = athleteNamed($this->academy, 'Rossi');
    attendedOn($athlete, [now()->startOfMonth()->toDateString()]);

    $row = $this->getJson("/api/v1/athletes/{$athlete->id}")->json('data');

    // Null is "not asked for". Zero would be indistinguishable from someone
    // who has genuinely never trained.
    expect($row['attendance_month_count'])->toBeNull()
        ->and($row['attendance_total_count'])->toBeNull();
});
