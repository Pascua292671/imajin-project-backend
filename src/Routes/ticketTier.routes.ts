import { Router } from "express";
import { getEventTicketTiers } from "../Controller/TicketTierController";

const router = Router();

router.get("/:eventId", getEventTicketTiers);

export default router;