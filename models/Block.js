const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Block = sequelize.define('Block', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  locationId: { type: DataTypes.INTEGER, allowNull: false },
  blockName: { type: DataTypes.STRING(100), allowNull: false },
  createdBy: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'blocks' });

module.exports = Block;
