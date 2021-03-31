// Library for Discord-specific functions
import {
    Message,
    Guild,
    GuildMember,
    Permissions,
    TextChannel,
    DMChannel,
    NewsChannel,
    MessageOptions
} from "discord.js";
import FileManager from "./storage";
import {eventListeners} from "../events/messageReactionRemove";
import {client} from "../index";
import {EmoteRegistryDump} from "./structures";

export function botHasPermission(guild: Guild | null, permission: number): boolean {
    return !!guild?.me?.hasPermission(permission);
}

export function updateGlobalEmoteRegistry(): void {
    const data: EmoteRegistryDump = {version: 1, list: []};

    for (const guild of client.guilds.cache.values()) {
        for (const emote of guild.emojis.cache.values()) {
            data.list.push({
                ref: emote.name,
                id: emote.id,
                name: emote.name,
                requires_colons: emote.requiresColons || false,
                animated: emote.animated,
                url: emote.url,
                guild_id: emote.guild.name,
                guild_name: emote.guild.name
            });
        }
    }

    FileManager.write("emote-registry", data, true);
}

// Maybe promisify this section to reduce the potential for creating callback hell? Especially if multiple questions in a row are being asked.

// Pagination function that allows for customization via a callback.
// Define your own pages outside the function because this only manages the actual turning of pages.
export async function paginate(
    channel: TextChannel | DMChannel | NewsChannel,
    senderID: string,
    total: number,
    callback: (page: number, hasMultiplePages: boolean) => MessageOptions & {split?: false},
    duration = 60000
) {
    const hasMultiplePages = total > 1;
    const message = await channel.send(callback(0, hasMultiplePages));

    if (hasMultiplePages) {
        let page = 0;
        const turn = (amount: number) => {
            page += amount;

            if (page < 0) page += total;
            else if (page >= total) page -= total;

            message.edit(callback(page, true));
        };
        const BACKWARDS_EMOJI = "⬅️";
        const FORWARDS_EMOJI = "➡️";
        const handle = (emote: string, reacterID: string) => {
            if (senderID === reacterID) {
                switch (emote) {
                    case BACKWARDS_EMOJI:
                        turn(-1);
                        break;
                    case FORWARDS_EMOJI:
                        turn(1);
                        break;
                }
            }
        };

        // Listen for reactions and call the handler.
        let backwardsReaction = await message.react(BACKWARDS_EMOJI);
        let forwardsReaction = await message.react(FORWARDS_EMOJI);
        eventListeners.set(message.id, handle);
        const collector = message.createReactionCollector(
            (reaction, user) => {
                if (user.id === senderID) {
                    // The reason this is inside the call is because it's possible to switch a user's permissions halfway and suddenly throw an error.
                    // This will dynamically adjust for that, switching modes depending on whether it currently has the "Manage Messages" permission.
                    const canDeleteEmotes = botHasPermission(message.guild, Permissions.FLAGS.MANAGE_MESSAGES);
                    handle(reaction.emoji.name, user.id);
                    if (canDeleteEmotes) reaction.users.remove(user);
                    collector.resetTimer();
                }

                return false;
            },
            // Apparently, regardless of whether you put "time" or "idle", it won't matter to the collector.
            // In order to actually reset the timer, you have to do it manually via collector.resetTimer().
            {time: duration}
        );

        // When time's up, remove the bot's own reactions.
        collector.on("end", () => {
            eventListeners.delete(message.id);
            backwardsReaction.users.remove(message.author);
            forwardsReaction.users.remove(message.author);
        });
    }
}

// Waits for the sender to either confirm an action or let it pass (and delete the message).
// This should probably be renamed to "confirm" now that I think of it, "prompt" is better used elsewhere.
// Append "\n*(This message will automatically be deleted after 10 seconds.)*" in the future?
export async function prompt(message: Message, senderID: string, onConfirm: () => void, duration = 10000) {
    let isDeleted = false;

    message.react("✅");
    await message.awaitReactions(
        (reaction, user) => {
            if (user.id === senderID) {
                if (reaction.emoji.name === "✅") {
                    onConfirm();
                    isDeleted = true;
                    message.delete();
                }
            }

            // CollectorFilter requires a boolean to be returned.
            // My guess is that the return value of awaitReactions can be altered by making a boolean filter.
            // However, because that's not my concern with this command, I don't have to worry about it.
            // May as well just set it to false because I'm not concerned with collecting any reactions.
            return false;
        },
        {time: duration}
    );

    if (!isDeleted) message.delete();
}

// A list of "channel-message" and callback pairs. Also, I imagine that the callback will be much more maintainable when discord.js v13 comes out with a dedicated message.referencedMessage property.
// Also, I'm defining it here instead of the message event because the load order screws up if you export it from there. Yeah... I'm starting to notice just how much technical debt has been built up. The command handler needs to be modularized and refactored sooner rather than later. Define all constants in one area then grab from there.
export const replyEventListeners = new Map<string, (message: Message) => void>();

// Asks the user for some input using the inline reply feature. The message here is a message you send beforehand.
// If the reply is rejected, reply with an error message (when stable support comes from discord.js).
// Append "\n*(Note: Make sure to use Discord's inline reply feature or this won't work!)*" in the future? And also the "you can now reply to this message" edit.
export function ask(
    message: Message,
    senderID: string,
    condition: (reply: string) => boolean,
    onSuccess: () => void,
    onReject: () => string,
    timeout = 60000
) {
    const referenceID = `${message.channel.id}-${message.id}`;

    replyEventListeners.set(referenceID, (reply) => {
        if (reply.author.id === senderID) {
            if (condition(reply.content)) {
                onSuccess();
                replyEventListeners.delete(referenceID);
            } else {
                reply.reply(onReject());
            }
        }
    });

    setTimeout(() => {
        replyEventListeners.set(referenceID, (reply) => {
            reply.reply("that action timed out, try using the command again");
            replyEventListeners.delete(referenceID);
        });
    }, timeout);
}

export function askYesOrNo(message: Message, senderID: string, timeout = 30000): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
        let isDeleted = false;

        await message.react("✅");
        message.react("❌");
        await message.awaitReactions(
            (reaction, user) => {
                if (user.id === senderID) {
                    const isCheckReacted = reaction.emoji.name === "✅";

                    if (isCheckReacted || reaction.emoji.name === "❌") {
                        resolve(isCheckReacted);
                        isDeleted = true;
                        message.delete();
                    }
                }

                return false;
            },
            {time: timeout}
        );

        if (!isDeleted) {
            message.delete();
            reject("Prompt timed out.");
        }
    });
}

// This MUST be split into an array. These emojis are made up of several characters each, adding up to 29 in length.
const multiNumbers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

// This will bring up an option to let the user choose between one option out of many.
// This definitely needs a single callback alternative, because using the numerical version isn't actually that uncommon of a pattern.
export async function askMultipleChoice(
    message: Message,
    senderID: string,
    callbackStack: (() => void)[],
    timeout = 90000
) {
    if (callbackStack.length > multiNumbers.length) {
        message.channel.send(
            `\`ERROR: The amount of callbacks in "askMultipleChoice" must not exceed the total amount of allowed options (${multiNumbers.length})!\``
        );
        return;
    }

    let isDeleted = false;

    for (let i = 0; i < callbackStack.length; i++) {
        await message.react(multiNumbers[i]);
    }

    await message.awaitReactions(
        (reaction, user) => {
            if (user.id === senderID) {
                const index = multiNumbers.indexOf(reaction.emoji.name);

                if (index !== -1) {
                    callbackStack[index]();
                    isDeleted = true;
                    message.delete();
                }
            }

            return false;
        },
        {time: timeout}
    );

    if (!isDeleted) message.delete();
}

export async function getMemberByUsername(guild: Guild, username: string) {
    return (
        await guild.members.fetch({
            query: username,
            limit: 1
        })
    ).first();
}

/** Convenience function to handle false cases automatically. */
export async function callMemberByUsername(
    message: Message,
    username: string,
    onSuccess: (member: GuildMember) => void
) {
    const guild = message.guild;
    const send = message.channel.send;

    if (guild) {
        const member = await getMemberByUsername(guild, username);

        if (member) onSuccess(member);
        else send(`Couldn't find a user by the name of \`${username}\`!`);
    } else send("You must execute this command in a server!");
}
