const sequelize = require('../config/database');
const User = require('./User');
const Location = require('./Location');
const Block = require('./Block');
const Businessman = require('./Businessman');

// Location associations
Location.belongsTo(User,     { foreignKey: 'createdBy',  as: 'creator' });
User.hasMany(Location,       { foreignKey: 'createdBy',  as: 'locations' });
Location.hasMany(Block,      { foreignKey: 'locationId', as: 'blocks' });
Block.belongsTo(Location,    { foreignKey: 'locationId', as: 'location' });

// Block associations
Block.belongsTo(User,        { foreignKey: 'createdBy',  as: 'creator' });
Block.hasMany(Businessman,   { foreignKey: 'blockId',    as: 'businessmen' });

// Businessman associations
Businessman.belongsTo(Location, { foreignKey: 'locationId', as: 'location' });
Location.hasMany(Businessman,   { foreignKey: 'locationId', as: 'businessmen' });
Businessman.belongsTo(Block,    { foreignKey: 'blockId',    as: 'block' });
Businessman.belongsTo(User,     { foreignKey: 'registeredBy', as: 'registrar' });
User.hasMany(Businessman,       { foreignKey: 'registeredBy', as: 'registrations' });

module.exports = { sequelize, User, Location, Block, Businessman };
