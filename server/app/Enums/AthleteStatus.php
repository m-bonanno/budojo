<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Whether an athlete trains here.
 *
 * Two states, not three. `Suspended` existed until #1427 and was retired
 * because it was never a third answer: five separate pipelines — payment
 * expectations, the unpaid digest, the overdue push, medical-certificate
 * reminders, the digest mail — all read "not active", and none of them ever
 * told it apart from `Inactive`. The alpha tester who had run an academy on
 * this for months could not say what it was for, which is what a value with
 * no behaviour of its own looks like from the outside.
 *
 * If a real distinction ever appears — "away, and expected back" versus
 * "gone" — it comes back as a case with pipelines that treat it differently,
 * not as a label that reads differently.
 */
enum AthleteStatus: string
{
    case Active = 'active';
    case Inactive = 'inactive';
}
