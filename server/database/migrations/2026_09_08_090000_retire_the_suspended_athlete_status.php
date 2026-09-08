<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Retires the `suspended` athlete status (#1427).
 *
 * The alpha tester, running a real academy on this for months, reported that
 * he had never used it and could not say what it was for. The code agreed:
 * five independent pipelines — the roster's payment expectations, the unpaid
 * digest, the overdue push, the medical-certificate reminders and the digest
 * mail — all read *"not active"*, and **not one of them ever distinguished
 * `suspended` from `inactive`**. Two names for one value, and the second was
 * the one nobody could define.
 *
 * `athletes.status` is a plain `string` column, not a database enum, so
 * nothing structural changes here. This is purely the data.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('athletes')
            ->where('status', 'suspended')
            ->update(['status' => 'inactive']);
    }

    /**
     * Deliberately does nothing, and that is the honest answer.
     *
     * Once the rows are `inactive` there is no record of which of them used to
     * be `suspended` — the information is gone, not hidden. The tempting
     * `UPDATE ... SET status = 'suspended' WHERE status = 'inactive'` would be
     * far worse than a no-op: it would suspend every athlete who was already
     * inactive before this ran, inventing history to satisfy a method
     * signature.
     *
     * A migration that cannot be reversed should say so rather than reverse
     * something else.
     */
    public function down(): void
    {
    }
};
