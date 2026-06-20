const sequelize = require('../config/database');
const User = require('./User');
const Location = require('./Location');
const Businessman = require('./Businessman');

// Associations
Location.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
User.hasMany(Location, { foreignKey: 'createdBy', as: 'locations' });

Businessman.belongsTo(Location, { foreignKey: 'locationId', as: 'location' });
Location.hasMany(Businessman, { foreignKey: 'locationId', as: 'businessmen' });

Businessman.belongsTo(User, { foreignKey: 'registeredBy', as: 'registrar' });
User.hasMany(Businessman, { foreignKey: 'registeredBy', as: 'registrations' });

module.exports = { sequelize, User, Location, Businessman };
