const { App, ExpressReceiver, LogLevel } = require('@slack/bolt');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const bodyParser = require('body-parser');

const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    installerOptions: {
        redirectUri: process.env.SLACK_AUTH_CALLBACK_URL,
        redirectUriPath: '/oauth/callback',
    },
});

receiver.router.use(bodyParser.urlencoded({ extended: true }));
receiver.router.use(bodyParser.json());

receiver.router.get('/oauth/callback', async (req, res) => {
    try {
        const result = await app.client.oauth.v2.access({
            client_id: process.env.SLACK_CLIENT_ID,
            client_secret: process.env.SLACK_CLIENT_SECRET,
            redirect_uri: process.env.SLACK_AUTH_CALLBACK_URL,
            code: req.query.code,
        });
        res.redirect('slack://app?team=' + result.team.id);
    } catch (error) {
        console.error('Error handling OAuth callback:', error);
        res.status(500).send('An error occurred during OAuth.');
    }
});

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver,
    logLevel: LogLevel.DEBUG,
});

const mongoClient = new MongoClient(process.env.MONGODB_URI);
let db;
let skillsCollection;

(async () => {
    await mongoClient.connect();
    db = mongoClient.db(process.env.MONGODB_NAME);
    skillsCollection = db.collection('skills');
})();

app.command('/add-skills', async ({ command, ack, say, client }) => {
    try {
        await ack();

        const { user_id } = command;

        const user = await db.collection('users').findOne({ user_id });

        // Retrieve existing skills from the skills collection
        const existingSkills = await skillsCollection.find().toArray();
        const existingSkillNames = existingSkills.map((skill) => skill.name);

        if (user) {
            const userSkills = user.skills.map((skillId) => {
                const skill = existingSkills.find((s) => s._id.toString() === skillId.toString());
                return skill ? skill.name : null;
            });

            const options = existingSkillNames.map((skillName) => ({
                text: {
                    type: 'plain_text',
                    text: skillName,
                },
                value: skillName,
            }));
            let initial_options;
            if(userSkills){
                initial_options = {
                    initial_options: userSkills
                        .filter((skill) => skill !== null)
                        .map((skill) => ({
                            text: {
                                type: 'plain_text',
                                text: skill,
                            },
                            value: skill,
                        })),
                };
            }

            const blocks = [
                {
                    type: 'input',
                    block_id: 'skills_input',
                    element: {
                        type: 'multi_static_select',
                        action_id: 'skills_select',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Select or add skills',
                        },
                        options,
                        ...initial_options
                    },
                    optional: true,
                    label: {
                        type: 'plain_text',
                        text: 'Skills',
                    },
                },
                {
                    type: 'input',
                    block_id: 'new_skill_input',
                    element: {
                        type: 'plain_text_input',
                        action_id: 'new_skill_input',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Enter a new skill',
                        },
                    },
                    optional: true,
                    label: {
                        type: 'plain_text',
                        text: 'New Skill',
                    },
                },
            ];

            await client.views.open({
                trigger_id: command.trigger_id,
                view: {
                    type: 'modal',
                    callback_id: 'add_skills_modal',
                    title: {
                        type: 'plain_text',
                        text: 'Add Skills',
                    },
                    submit: {
                        type: 'plain_text',
                        text: 'Submit',
                    },
                    blocks,
                },
            });
        } else {
            const options = existingSkillNames.map((skillName) => ({
                text: {
                    type: 'plain_text',
                    text: skillName,
                },
                value: skillName,
            }));

            const blocks = [
                {
                    type: 'input',
                    block_id: 'skills_input',
                    element: {
                        type: 'multi_static_select',
                        action_id: 'skills_select',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Select existing or add new skills',
                        },
                        options,
                    },
                    optional: true,
                    label: {
                        type: 'plain_text',
                        text: 'Skills',
                    },
                },
                {
                    type: 'input',
                    block_id: 'new_skill_input',
                    element: {
                        type: 'plain_text_input',
                        action_id: 'new_skill_input',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Enter a new skill',
                        },
                    },
                    optional: true,
                    label: {
                        type: 'plain_text',
                        text: 'New Skill',
                    },
                },
            ];

            await client.views.open({
                trigger_id: command.trigger_id,
                view: {
                    type: 'modal',
                    callback_id: 'add_skills_modal',
                    title: {
                        type: 'plain_text',
                        text: 'Add Skills',
                    },
                    submit: {
                        type: 'plain_text',
                        text: 'Submit',
                    },
                    blocks,
                },
            });
        }
    } catch (error) {
        console.error('Error handling /add-skills command:', error);
    }
});


app.command('/find-skills', async ({ command, ack, say, client }) => {
    await ack();

    const skills = await skillsCollection.find().toArray();
    const skillOptions = skills.map((skill) => ({
        text: {
            type: 'plain_text',
            text: skill.name,
        },
        value: skill.name,
    }));

    await client.views.open({
        trigger_id: command.trigger_id,
        view: {
            type: 'modal',
            callback_id: 'find_skills_modal',
            title: {
                type: 'plain_text',
                text: 'Find Skills',
            },
            submit: {
                type: 'plain_text',
                text: 'Submit',
            },
            blocks: [
                {
                    type: 'input',
                    block_id: 'skills_input',
                    element: {
                        type: 'static_select',
                        action_id: 'skills_select',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Select a skill',
                        },
                        options: skillOptions,
                    },
                    label: {
                        type: 'plain_text',
                        text: 'Skill',
                    },
                },
            ],
        },
    });
});

receiver.router.post('/skills-modal-submit', async (req, res) => {
    try {
        const payload = JSON.parse(req.body.payload);
        const { user, view, response_urls } = payload;
        const { id: user_id } = user;
        const {callback_id} = view;
        if(callback_id === 'add_skills_modal'){
            const selectedSkills = view.state.values.skills_input.skills_select.selected_options;
            const newSkillsInput = view.state.values.new_skill_input.new_skill_input.value;
            const skills = selectedSkills.map((selectedSkill) => selectedSkill.value.toLowerCase().trim());
            // Split the new skills input by commas
            if(newSkillsInput){
                const newSkills = newSkillsInput.split(",").map(skill => skill.trim());
                skills.push(...newSkills); // Add new skills to the array
            }
            // Remove duplicates from the skills array
            const uniqueSkills = [...new Set(skills)];

            const skillIds = await Promise.all(
                uniqueSkills.map(async (skill) => {
                    const existingSkill = await skillsCollection.findOne({ name: skill });
                    if (existingSkill) {
                        return existingSkill._id;
                    } else {
                        const result = await skillsCollection.insertOne({ name: skill });
                        return result.insertedId;
                    }
                })
            );

            const userExists = await db.collection('users').findOne({ user_id });
            if (userExists) {
                // User exists, update skills
                await db.collection('users').updateOne({ user_id }, { $addToSet: { skills: { $each: skillIds } } });
                await app.client.chat.postMessage({
                    channel: user_id,
                    text: 'Skills updated successfully!',
                });
            } else {
                // User doesn't exist, add new user
                await db.collection('users').insertOne({ user_id, skills: skillIds });
                await app.client.chat.postMessage({
                    channel: user_id,
                    text: 'Your skills were added successfully!',
                });
            }

            if (response_urls && response_urls.length > 0) {
                // Send empty responses to response URLs to dismiss the modal
                const dismissPromises = response_urls.map(async (url) => {
                    await axios.post(url, { response_action: 'clear' });
                });
                await Promise.all(dismissPromises);
            }

            res.send('');
        }else{
            const selectedSkillName = view.state.values.skills_input.skills_select.selected_option.value;

            // Find the skill in the skills collection based on its name
            const selectedSkill = await skillsCollection.findOne({ name: selectedSkillName });

            if (selectedSkill) {
                const skillId = selectedSkill._id;

                // Find users with the selected skill ID
                const users = await db.collection('users').find({ skills: skillId }).toArray();

                // Process the user list
                if (users.length > 0) {
                    const userList = await Promise.all(users.map(async (user) => {
                        const userInfo = await app.client.users.info({ user: user.user_id });
                        const { real_name, id } = userInfo.user;
                        const userLink = `slack://user?team=${payload.team.id}&id=${id}`;
                        return `- <${userLink}|${real_name}>`;
                    }));

                    await app.client.chat.postMessage({
                        channel: user_id,
                        text: `Users with the skill '${selectedSkillName}':\n${userList.join('\n')}`,
                    });
                } else {
                    await app.client.chat.postMessage({
                        channel: user_id,
                        text: `No users found with the skill '${selectedSkillName}'.`,
                    });
                }
            } else {
                console.error('Selected skill not found:', selectedSkillName);
                await app.client.chat.postMessage({
                    channel: user_id,
                    text: `Skill not found in database '${selectedSkillName}'.`,
                });
            }
            res.send('');
        }

    } catch (error) {
        console.error('Error handling skills modal submission:', error);
        res.status(500).send('An error occurred during skills submission.');
    }
});


app.event('app_home_opened', async ({ event, client }) => {
    try {
        await client.views.publish({
            user_id: event.user,
            view: {
                type: 'home',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: 'Welcome to the Slack bot app!',
                        },
                    },
                ],
            },
        });
    } catch (error) {
        console.error('Error publishing home tab:', error);
    }
});

(async () => {
    await app.start(process.env.PORT || 3000);
    console.log('⚡️ Bolt app is running!');
})();
