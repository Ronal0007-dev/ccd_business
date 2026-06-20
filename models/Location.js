const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Location = sequelize.define('Location', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  locationName: { type: DataTypes.STRING(150), allowNull: false },
  ward: { type: DataTypes.STRING(100), allowNull: false },
  createdBy: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'locations' });

module.exports = Location;
