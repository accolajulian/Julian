"""Writes the targeting parts of behavior_pack/entities/ai_player.json.

The Script API can't set a mob's target directly, so the script "points" each AI at a
target with tags, using numbered brain slots (one per loaded AI):
  aip_s<k>  on the AI that uses slot k
  aip_h<k>  on the entity that AI should hunt
  aip_a<k>  on every entity that AI must never attack (owner, allies, friendly AIs)
Run: python3 tools/make_entity_targets.py"""
import json
from pathlib import Path

SLOTS = 16
PATH = Path(__file__).resolve().parent.parent / "behavior_pack/entities/ai_player.json"


def not_friendly():
    """True unless the candidate carries the ally tag for this AI's slot."""
    return {"all_of": [
        {"any_of": [
            {"test": "has_tag", "subject": "self", "operator": "!=", "value": f"aip_s{k}"},
            {"test": "has_tag", "subject": "other", "operator": "!=", "value": f"aip_a{k}"},
        ]} for k in range(SLOTS)
    ] + [{"test": "is_owner", "subject": "other", "operator": "!=", "value": True}]}


def main():
    e = json.loads(PATH.read_text())
    ent = e["minecraft:entity"]
    g, c, ev = ent["component_groups"], ent["components"], ent["events"]
    safe = {"filters": not_friendly()}

    follow = {"priority": 5, "speed_multiplier": 1.2, "start_distance": 6, "stop_distance": 2}
    g["aip:role_fighter"] = {
        # The script's chosen target (tagged aip_h<slot>) comes first.
        "minecraft:behavior.nearest_attackable_target": {
            "priority": 1, "must_see": False, "reselect_targets": True, "within_radius": 24.0,
            "scan_interval": 5,
            "entity_types": [{"filters": {"all_of": [
                {"test": "has_tag", "subject": "self", "value": f"aip_s{k}"},
                {"test": "has_tag", "subject": "other", "value": f"aip_h{k}"},
            ]}, "max_dist": 24} for k in range(SLOTS)],
        },
        # Instant reactions while the script catches up. Never against friends.
        "minecraft:behavior.owner_hurt_by_target": {"priority": 2, "entity_types": safe},
        "minecraft:behavior.owner_hurt_target": {"priority": 3, "entity_types": safe},
        "minecraft:health": {"value": 60, "max": 60},
        "minecraft:attack": {"damage": 6},
    }
    g["aip:role_resource"] = {"minecraft:health": {"value": 30, "max": 30}, "minecraft:attack": {"damage": 3}}
    # Modes. mark_variant is just a harmless marker so each group has a component.
    g["aip:fighter_follow"] = {"minecraft:behavior.follow_owner": follow, "minecraft:mark_variant": {"value": 0}}
    g["aip:fighter_guard"] = {"minecraft:mark_variant": {"value": 1}}
    g["aip:resource_follow"] = {"minecraft:behavior.follow_owner": follow}
    # Low health: run from danger while the script heals it.
    g["aip:retreating"] = {"minecraft:behavior.avoid_mob_type": {
        "priority": 1,
        "entity_types": [{"filters": {"any_of": [
            {"test": "is_family", "subject": "other", "value": "monster"},
            {"all_of": [
                {"test": "is_family", "subject": "other", "value": "player"},
                {"test": "is_owner", "subject": "other", "operator": "!=", "value": True},
            ]},
        ]}, "max_dist": 10, "walk_speed_multiplier": 1.1, "sprint_speed_multiplier": 1.4}],
    }}
    ev["aip:retreat"] = {"add": {"component_groups": ["aip:retreating"]}}
    ev["aip:recovered"] = {"remove": {"component_groups": ["aip:retreating"]}}

    c["minecraft:behavior.hurt_by_target"] = {"priority": 4, "entity_types": safe}
    PATH.write_text(json.dumps(e, indent=2) + "\n")
    print("wrote targeting for", SLOTS, "slots")


if __name__ == "__main__":
    main()
