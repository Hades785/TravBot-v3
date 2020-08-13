import {GuildMember, Permissions} from "discord.js";
import {Config} from "./structures";
import $ from "./lib";

export enum PERMISSIONS {NONE, MOD, ADMIN, OWNER, BOT_SUPPORT, BOT_ADMIN, BOT_OWNER};
export const PermissionNames = ["User", "Moderator", "Administrator", "Server Owner", "Bot Support", "Bot Admin", "Bot Owner"];

// Here is where you enter in the functions that check for permissions.
const PermissionChecker: ((member: GuildMember) => boolean)[] = [
	// NONE //
	() => true,
	
	// MOD //
	(member: GuildMember) => 
		member.hasPermission(Permissions.FLAGS.MANAGE_ROLES) ||
		member.hasPermission(Permissions.FLAGS.MANAGE_MESSAGES) ||
		member.hasPermission(Permissions.FLAGS.KICK_MEMBERS) ||
		member.hasPermission(Permissions.FLAGS.BAN_MEMBERS),
	
	// ADMIN //
	(member: GuildMember) => member.hasPermission(Permissions.FLAGS.ADMINISTRATOR),
	
	// OWNER //
	(member: GuildMember) => member.guild.ownerID === member.id,
	
	// BOT_SUPPORT //
	(member: GuildMember) => Config.support.includes(member.id),
	
	// BOT_ADMIN //
	(member: GuildMember) => Config.admins.includes(member.id),
	
	// BOT_OWNER //
	(member: GuildMember) => Config.owner === member.id
];

// After checking the lengths of these three objects, use this as the length for consistency.
const length = Object.keys(PERMISSIONS).length / 2;

export function hasPermission(member: GuildMember, permission: PERMISSIONS): boolean
{
	if(permission === PERMISSIONS.NONE)
		return true;
	
	for(let i = length-1; i >= permission; i--)
	{
		const condition = PermissionChecker[i](member);
		
		if(condition)
			return true;
	}
	
	return false;
}

export function getPermissionLevel(member: GuildMember): number
{
	for(let i = length-1; i >= 0; i--)
	{
		const condition = PermissionChecker[i](member);
		
		if(condition)
			return i;
	}
	
	return 0;
}

// Length Checking
(() => {
	const lenNames = PermissionNames.length;
	const lenChecker = PermissionChecker.length;
	
	// By transitive property, lenNames and lenChecker have to be equal to each other as well.
	if(length !== lenNames || length !== lenChecker)
		$.error(`Permission object lengths aren't equal! Enum Length (${length}), Names Length (${lenNames}), and Functions Length (${lenChecker}). This WILL cause problems!`);
})()