"use strict";

const { z } = require("zod");

const CreateDelegationSchema = z.object({
    fromUser: z.string().uuid("fromUser must be a valid UUID"),
    toUser: z.string().uuid("toUser must be a valid UUID"),
    startDate: z.string().datetime("startDate must be a valid ISO datetime"),
    endDate: z.string().datetime("endDate must be a valid ISO datetime"),
}).refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "endDate must be after startDate",
    path: ["endDate"],
});

module.exports = { CreateDelegationSchema };
